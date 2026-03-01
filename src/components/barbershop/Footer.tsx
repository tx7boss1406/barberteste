import { Scissors, Instagram, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card py-12">
      <div className="container mx-auto grid gap-8 px-4 md:grid-cols-3">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Scissors className="h-5 w-5 text-gold" />
            <span className="font-heading text-lg font-bold text-foreground">BARBER CLUB & TATTOO</span>
          </div>
          <p className="font-body text-sm text-muted-foreground">
            Onde o estilo encontra a tradição. Experiência premium em barbearia.
          </p>
        </div>
        <div>
          <h4 className="mb-4 font-heading text-sm font-semibold uppercase tracking-widest text-gold">Contato</h4>
          <div className="space-y-2 font-body text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> (11) 99999-9999</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Rua da Barbearia, 123</p>
            <p className="flex items-center gap-2"><Instagram className="h-4 w-4" /> @barberclub</p>
          </div>
        </div>
        <div>
          <h4 className="mb-4 font-heading text-sm font-semibold uppercase tracking-widest text-gold">Links</h4>
          <div className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
            <Link to="/agendar" className="hover:text-gold">Agendar</Link>
            <Link to="/admin" className="hover:text-gold">Área Admin</Link>
          </div>
        </div>
      </div>
      <div className="container mx-auto mt-8 border-t border-border px-4 pt-6 text-center">
        <p className="font-body text-xs text-muted-foreground">
          © {new Date().getFullYear()} BARBER CLUB & TATTOO. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
