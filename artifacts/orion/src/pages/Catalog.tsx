import { Shell } from "@/components/layout/Shell";
import { useListSatellites, useListCategories, getListSatellitesQueryKey } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Search, Filter, Database, Loader2 } from "lucide-react";

export default function Catalog() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: categories } = useListCategories();
  
  const queryParams = { 
    search: debouncedSearch || undefined, 
    category: category || undefined,
    limit: 500
  };
  
  const { data: satellites, isLoading } = useListSatellites(queryParams, {
    query: { queryKey: getListSatellitesQueryKey(queryParams) }
  });
  
  return (
    <Shell>
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_bottom,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />
        
        <div className="p-6 lg:p-10 border-b border-primary/20 bg-card/40 backdrop-blur-sm shrink-0 relative z-10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 items-end justify-between">
            <div>
              <div className="flex items-center gap-3 text-primary mb-2">
                <Database className="w-6 h-6" />
                <h2 className="text-xl font-mono tracking-[0.2em] font-bold">ORBITAL CATALOG</h2>
              </div>
              <p className="text-sm text-muted-foreground font-mono tracking-widest">
                MASTER DATABASE OF TRACKED SPACE OBJECTS
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto font-mono">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary/50" />
                <input 
                  type="text" 
                  placeholder="SEARCH BY NAME..." 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full bg-black/40 border border-primary/30 text-white placeholder:text-primary/30 pl-10 pr-4 py-2 text-xs tracking-widest focus:outline-none focus:border-primary/80 transition-colors"
                />
              </div>
              <div className="relative w-full sm:w-auto">
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full sm:w-auto appearance-none bg-black/40 border border-primary/30 text-primary text-xs tracking-widest pl-4 pr-10 py-2 focus:outline-none focus:border-primary/80 cursor-pointer"
                >
                  <option value="">ALL CATEGORIES</option>
                  {categories?.map(c => (
                    <option key={c.id} value={c.id}>{c.label.toUpperCase()}</option>
                  ))}
                </select>
                <Filter className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-primary/50 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 relative z-10">
          <div className="max-w-7xl mx-auto">
            <div className="bg-card/60 backdrop-blur-md border border-primary/20">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-sm min-w-[800px]">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur-md z-10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                    <tr className="border-b border-primary/30 text-primary/80 text-[10px] uppercase tracking-[0.15em]">
                      <th className="py-4 px-4 whitespace-nowrap">NORAD ID</th>
                      <th className="py-4 px-4 whitespace-nowrap">Object Name</th>
                      <th className="py-4 px-4 whitespace-nowrap">Category</th>
                      <th className="py-4 px-4 whitespace-nowrap">Status</th>
                      <th className="py-4 px-4 text-right whitespace-nowrap">Altitude</th>
                      <th className="py-4 px-4 text-right whitespace-nowrap">Inclination</th>
                      <th className="py-4 px-4 text-right whitespace-nowrap">Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="py-32 text-center">
                          <div className="flex flex-col items-center gap-4 text-primary">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <div className="text-xs tracking-[0.2em] animate-pulse">QUERYING DATABASE...</div>
                          </div>
                        </td>
                      </tr>
                    ) : satellites?.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-32 text-center text-primary/50 text-xs tracking-[0.2em]">
                          NO MATCHING OBJECTS FOUND
                        </td>
                      </tr>
                    ) : (
                      satellites?.map((sat) => (
                        <tr key={sat.noradId} className="border-b border-primary/10 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-primary/70">{sat.noradId}</td>
                          <td className="py-3 px-4 text-white font-bold tracking-wider">{sat.name}</td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-primary/20 px-2 py-0.5 bg-black/40">
                              {categories?.find(c => c.id === sat.category)?.label || sat.category}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              {sat.isActive ? (
                                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]" title="Active" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-muted-foreground/30" title="Inactive" />
                              )}
                              {sat.isDebris && (
                                <span className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="Debris" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-white whitespace-nowrap">{sat.alt.toFixed(1)} km</td>
                          <td className="py-3 px-4 text-right text-muted-foreground whitespace-nowrap">{sat.inclination.toFixed(2)}°</td>
                          <td className="py-3 px-4 text-right text-muted-foreground whitespace-nowrap">{sat.velocity.toFixed(2)} km/s</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}