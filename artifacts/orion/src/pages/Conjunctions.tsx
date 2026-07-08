import { Shell } from "@/components/layout/Shell";
import { useListConjunctions, getListConjunctionsQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";

export default function Conjunctions() {
  const { data: conjunctions, isLoading } = useListConjunctions({ 
    query: { refetchInterval: 30000, queryKey: getListConjunctionsQueryKey() } 
  });
  
  const sorted = useMemo(() => {
    if (!conjunctions) return [];
    const threatScores = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return [...conjunctions].sort((a, b) => 
      (threatScores[b.threatLevel as keyof typeof threatScores] || 0) - 
      (threatScores[a.threatLevel as keyof typeof threatScores] || 0)
    );
  }, [conjunctions]);

  const getThreatColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'text-destructive border-destructive/50 bg-destructive/10 shadow-[0_0_10px_rgba(255,0,0,0.2)]';
      case 'HIGH': return 'text-orange-500 border-orange-500/50 bg-orange-500/10 shadow-[0_0_10px_rgba(249,115,22,0.2)]';
      case 'MEDIUM': return 'text-amber-400 border-amber-400/50 bg-amber-400/10';
      case 'LOW': return 'text-green-400 border-green-400/50 bg-green-400/10';
      default: return 'text-muted-foreground border-border bg-muted/20';
    }
  };

  return (
    <Shell>
      <div className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.03)_0%,transparent_100%)] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="mb-8 flex items-end justify-between border-b border-primary/30 pb-4">
            <div>
              <div className="flex items-center gap-3 text-destructive mb-2">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
                <h2 className="text-xl font-mono tracking-[0.2em] font-bold">CONJUNCTION ANALYSIS</h2>
              </div>
              <p className="text-sm text-muted-foreground font-mono tracking-widest">
                PREDICTED CLOSE APPROACH EVENTS &lt; 10KM
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-3xl font-bold text-white tracking-tighter">
                {conjunctions?.length || 0}
              </div>
              <div className="text-[10px] text-primary/70 uppercase tracking-[0.2em]">Active Alerts</div>
            </div>
          </div>

          <div className="bg-card/60 backdrop-blur-md border border-primary/20 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-primary/30 bg-primary/5 text-primary/80 text-[10px] uppercase tracking-[0.15em]">
                    <th className="py-4 px-4 whitespace-nowrap">Threat Level</th>
                    <th className="py-4 px-4 whitespace-nowrap">Primary Object</th>
                    <th className="py-4 px-4 whitespace-nowrap">Secondary Object</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">Min Range (km)</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">Rel Velocity (km/s)</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">Probability</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">Time of Approach (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-primary/50 text-xs tracking-[0.2em] animate-pulse">
                        ANALYZING TRAJECTORIES...
                      </td>
                    </tr>
                  ) : sorted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-green-400 text-xs tracking-[0.2em]">
                        NO CONJUNCTION EVENTS DETECTED
                      </td>
                    </tr>
                  ) : (
                    sorted.map((event) => (
                      <tr key={event.id} className="border-b border-primary/10 hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest px-2.5 py-1 border ${getThreatColor(event.threatLevel)}`}>
                            {event.threatLevel === 'CRITICAL' && <AlertCircle className="w-3 h-3" />}
                            {event.threatLevel}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-white font-bold tracking-wider">{event.primaryName}</div>
                          <div className="text-[10px] text-primary/60 tracking-widest mt-0.5">NORAD: {event.primaryNoradId}</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-white font-bold tracking-wider">{event.secondaryName}</div>
                          <div className="text-[10px] text-primary/60 tracking-widest mt-0.5">NORAD: {event.secondaryNoradId}</div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className={`text-lg font-bold ${event.minRange < 1 ? 'text-destructive' : 'text-white'}`}>
                            {event.minRange.toFixed(3)}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right text-muted-foreground">
                          {event.relativeVelocity.toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="text-white">
                            {(event.probability * 100).toFixed(4)}%
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right text-primary/80">
                          {format(parseISO(event.timeOfClosestApproach), 'yyyy-MM-dd HH:mm:ss')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}