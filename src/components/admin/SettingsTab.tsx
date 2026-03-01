import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function SettingsTab() {
  const qc = useQueryClient();
  const [abertura, setAbertura] = useState("09:00");
  const [fechamento, setFechamento] = useState("20:00");
  const [intervalo, setIntervalo] = useState(30);

  const { data: config } = useQuery({
    queryKey: ["admin-config"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("*").limit(1).single();
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setAbertura(config.horario_abertura?.slice(0, 5) || "09:00");
      setFechamento(config.horario_fechamento?.slice(0, 5) || "20:00");
      setIntervalo(config.intervalo_minutos || 30);
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async () => {
      if (!config?.id) return;
      const { error } = await supabase.from("configuracoes").update({
        horario_abertura: abertura,
        horario_fechamento: fechamento,
        intervalo_minutos: intervalo,
      }).eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-config"] }); toast.success("Configurações salvas"); },
    onError: () => toast.error("Erro ao salvar"),
  });

  return (
    <div className="mx-auto max-w-md">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <label className="mb-1 block font-body text-sm text-muted-foreground">Horário de Abertura</label>
          <input type="time" value={abertura} onChange={(e) => setAbertura(e.target.value)} className="w-full rounded border border-border bg-secondary px-4 py-2 font-body text-sm text-foreground focus:border-gold focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block font-body text-sm text-muted-foreground">Horário de Fechamento</label>
          <input type="time" value={fechamento} onChange={(e) => setFechamento(e.target.value)} className="w-full rounded border border-border bg-secondary px-4 py-2 font-body text-sm text-foreground focus:border-gold focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block font-body text-sm text-muted-foreground">Intervalo entre atendimentos (min)</label>
          <input type="number" value={intervalo} onChange={(e) => setIntervalo(+e.target.value)} className="w-full rounded border border-border bg-secondary px-4 py-2 font-body text-sm text-foreground focus:border-gold focus:outline-none" />
        </div>
        <button onClick={() => save.mutate()} className="gold-gradient flex w-full items-center justify-center gap-2 rounded py-3 font-body text-sm font-semibold text-primary-foreground">
          <Save className="h-4 w-4" /> Salvar Configurações
        </button>
      </div>
    </div>
  );
}
