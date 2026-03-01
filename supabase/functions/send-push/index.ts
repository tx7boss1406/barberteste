import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---- Web Push Crypto Helpers ----

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64Url: string,
  publicKeyBase64Url: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const encoder = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64Url);
  const publicKeyBytes = base64UrlToUint8Array(publicKeyBase64Url);

  // Import private key as JWK
  const x = uint8ArrayToBase64Url(publicKeyBytes.slice(1, 33));
  const y = uint8ArrayToBase64Url(publicKeyBytes.slice(33, 65));

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: privateKeyBase64Url,
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format if needed
  const sigBytes = new Uint8Array(signature);
  const sigB64 = uint8ArrayToBase64Url(sigBytes);

  return `${unsignedToken}.${sigB64}`;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, salt.length > 0 ? salt : new Uint8Array(32)));

  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concatUint8Arrays(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));

  return okm.slice(0, length);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);

  const len1 = new Uint8Array(2);
  new DataView(len1.buffer).setUint16(0, clientPublicKey.length);
  const len2 = new Uint8Array(2);
  new DataView(len2.buffer).setUint16(0, serverPublicKey.length);

  return concatUint8Arrays(
    encoder.encode("Content-Encoding: "),
    typeBytes,
    new Uint8Array([0]),
    encoder.encode("P-256"),
    new Uint8Array([0]),
    len1,
    clientPublicKey,
    len2,
    serverPublicKey
  );
}

async function encryptPayload(
  clientPublicKeyBase64Url: string,
  clientAuthBase64Url: string,
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKeyBytes = base64UrlToUint8Array(clientPublicKeyBase64Url);
  const clientAuth = base64UrlToUint8Array(clientAuthBase64Url);

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeyPair.privateKey,
      256
    )
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive PRK using auth secret
  const encoder = new TextEncoder();
  const authInfo = encoder.encode("Content-Encoding: auth\0");
  const prk = await hkdf(clientAuth, sharedSecret, authInfo, 32);

  // Derive content encryption key
  const cekInfo = createInfo("aesgcm", clientPublicKeyBytes, serverPublicKeyRaw);
  const contentEncryptionKey = await hkdf(salt, prk, cekInfo, 16);

  // Derive nonce
  const nonceInfo = createInfo("nonce", clientPublicKeyBytes, serverPublicKeyRaw);
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Encrypt with AES-128-GCM
  const paddingLength = 2;
  const padding = new Uint8Array(paddingLength);
  const payloadBytes = encoder.encode(payload);
  const plaintext = concatUint8Arrays(padding, payloadBytes);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      plaintext
    )
  );

  return { ciphertext: encrypted, salt, serverPublicKey: serverPublicKeyRaw };
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const subject = "mailto:contato@barberclub.com";

    const jwt = await createVapidJwt(audience, subject, vapidPrivateKey, vapidPublicKey);

    const payloadStr = JSON.stringify(payload);
    const { ciphertext, salt, serverPublicKey } = await encryptPayload(
      subscription.keys.p256dh,
      subscription.keys.auth,
      payloadStr
    );

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aesgcm",
        "Content-Length": ciphertext.length.toString(),
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        "Crypto-Key": `dh=${uint8ArrayToBase64Url(serverPublicKey)}`,
        Encryption: `salt=${uint8ArrayToBase64Url(salt)}`,
        TTL: "86400",
        Urgency: "high",
      },
      body: ciphertext,
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired, should be removed
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error("Push send error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, title, body, url } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, title, or body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("user_id", user_id);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for user", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = { title, body, url: url || "/" };
    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      const subscription = sub.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
      const success = await sendWebPush(subscription, payload, vapidPublicKey, vapidPrivateKey);
      if (success) {
        sent++;
      } else {
        expiredIds.push(sub.id);
      }
    }

    // Remove expired subscriptions
    if (expiredIds.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .in("id", expiredIds);
    }

    return new Response(
      JSON.stringify({ sent, expired: expiredIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
