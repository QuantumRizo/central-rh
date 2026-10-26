import { ArrowUpRight } from "lucide-react";
import { TOOLS, type Tool } from "./catalog";

/** Página de una sección de herramientas: tarjetas agrupadas que abren cada sitio en otra pestaña. */
export function ToolsHub({ section, title, description, hasTool }: { section: Tool["section"] | Tool["section"][]; title: string; description: string; hasTool: (toolId: string) => boolean }) {
  const sections = Array.isArray(section) ? section : [section];
  const tools = TOOLS.filter((tool) => sections.includes(tool.section) && hasTool(tool.id));
  const groups = [...new Set(tools.map((tool) => tool.group))];
  return (
    <div className="tools-hub">
      <div className="page-header"><div><p className="eyebrow">Herramientas</p><h1>{title}</h1><p>{description}</p></div></div>
      {groups.map((group) => (
        <section className="tools-group" key={group} aria-label={group}>
          <h2>{group}</h2>
          <div className="tools-grid">
            {tools.filter((tool) => tool.group === group).map(({ id, label, description: text, icon: Icon, url }) => (
              <a className="tool-card" key={id} href={url} target="_blank" rel="noopener">
                <span className="tool-card-icon"><Icon size={22} /></span>
                <span className="tool-card-body"><strong>{label}<span className="visually-hidden"> (se abre en otra pestaña)</span></strong><span>{text}</span></span>
                <ArrowUpRight className="tool-card-open" size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
