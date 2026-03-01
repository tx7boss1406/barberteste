import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Clock, CheckCircle2, DollarSign, TrendingUp, Users } from "lucide-react";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardTab() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: reservasHoje = [], isLoading: loadingHoje } = useQuery({
    queryKey: ["admin-reservas-hoje", today],
    queryFn: async () => {
      const { data } = await supabase.from("reservas").select("*, servicos(preco, nome), barbeiros(nome)").eq("data", today);
      return data || [];
    },
  });

  const { data: reservasMes = [], isLoading: loadingMes } = useQuery({
    queryKey: ["admin-reservas-mes"],
    queryFn: async () => {
      const start = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const { data } = await supabase.from("reservas").select("*, servicos(preco)").gte("data", start);
      return data || [];
    },
  });

  const { data: reservasSemana = [] } = useQuery({
    queryKey: ["admin-reservas-semana"],
    queryFn: async () => {
      const start = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data } = await supabase.from("reservas").select("data").gte("data", start);
      return data || [];
    },
  });

  const isLoading = loadingHoje || loadingMes;

  const pendentes = reservasHoje.filter((r: any) => r.status === "pendente").length;
  const confirmados = reservasHoje.filter((r: any) => r.status === "confirmado").length;
  const receitaHoje = reservasHoje
    .filter((r: any) => r.status !== "cancelado")
    .reduce((sum: number, r: any) => sum + Number(r.servicos?.preco || 0), 0);
  const receitaMes = reservasMes
    .filter((r: any) => r.status !== "cancelado")
    .reduce((sum: number, r: any) => sum + Number(r.servicos?.preco || 0), 0);

  const metrics = [
    { label: "Reservas Hoje", value: reservasHoje.length, icon: CalendarDays, color: "text-gold" },
    { label: "Pendentes", value: pendentes, icon: Clock, color: "text-yellow-500" },
    { label: "Confirmados", value: confirmados, icon: CheckCircle2, color: "text-green-500" },
    { label: "Receita Hoje", value: `R$${receitaHoje.toFixed(2)}`, icon: DollarSign, color: "text-gold" },
    { label: "Receita do Mês", value: `R$${receitaMes.toFixed(2)}`, icon: TrendingUp, color: "text-green-500" },
    { label: "Total do Mês", value: reservasMes.length, icon: Users, color: "text-blue-400" },
  ];

  // Chart data - last 7 days
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
    const label = format(subDays(new Date(), 6 - i), "dd/MM");
    const count = reservasSemana.filter((r: any) => r.data === date).length;
    return { label, count };
  });

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-border bg-card p-6 transition-all hover:border-gold/30">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-body text-sm text-muted-foreground">{m.label}</span>
                <m.icon className={`h-5 w-5 ${m.color}`} />
              </div>
              <p className="font-heading text-3xl font-bold text-foreground">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 font-heading text-lg font-semibold text-foreground">Agendamentos — Últimos 7 dias</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'hsl(0 0% 60%)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(0 0% 60%)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(0 0% 7%)', border: '1px solid hsl(0 0% 18%)', borderRadius: '8px', fontSize: '13px' }}
                labelStyle={{ color: 'hsl(0 0% 96%)' }}
                itemStyle={{ color: 'hsl(40 45% 57%)' }}
              />
              <Bar dataKey="count" name="Reservas" fill="hsl(40 45% 57%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
