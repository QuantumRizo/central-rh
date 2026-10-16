import { ExternalLink } from "lucide-react";
import type { Tool } from "./catalog";

export function ToolsModule({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <div className="tools-module">
      <div className="page-header"><div><p className="eyebrow">TOOLS · {tool.group.toUpperCase()}</p><h1>{tool.label}</h1><p>{tool.description}</p></div></div>
      <section className="admin-card">
        <div className="card-heading"><div><h2><Icon size={19} /> {tool.label}</h2>
          <p>La herramienta se abre en su sitio, en otra pestaña.</p>
        </div></div>
        <a className="tools-open" href={tool.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Abrir {tool.label}</a>
      </section>
    </div>
  );
}
