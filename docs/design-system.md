# Sistema de diseño — Central RH

Reglas para que todos los módulos se vean como una sola aplicación. Si algo no está cubierto aquí, agrega el token o el componente compartido antes de escribir estilos sueltos.

## Archivos

```
src/styles.css            ← solo @import, en este orden
src/styles/tokens.css     ← colores, tipografía, espaciado, radios, sombras, ancho de página
src/styles/base.css       ← reset, inputs, botones, alertas, tablas
src/styles/layout.css     ← barra lateral, .content, .page-header
src/styles/components.css ← tarjeta, encabezado de tarjeta, métricas, badges, pestañas, barras, picker, skeletons, modal
src/styles/<módulo>.css   ← solo lo específico de cada módulo
```

Un módulo nuevo = un archivo nuevo en `src/styles/` importado al final de `src/styles.css`.

## Reglas

1. **Nunca escribas colores, tamaños de fuente, radios ni sombras a mano.** Usa `var(--…)` de `tokens.css`.
2. **Un solo ancho de página.** Todo módulo se renderiza dentro de `.content` (máx. `--page-width`, 1200 px). No pongas `max-width` ni `width` en el contenedor de un módulo.
3. **Una sola superficie.** Las tarjetas usan borde `--color-border`, radio `--radius-lg`, sombra `--shadow-xs` y relleno `--card-padding`. Agrega la clase nueva al selector de "Card (surface)" en `components.css` en lugar de redefinirla.
4. **Sin decoración.** Nada de degradados, glassmorphism (`backdrop-filter`), sombras de color, marcas de agua ni emojis como iconos. Iconos: `lucide-react`, 16–20 px.
5. **Pesos de fuente:** 400 texto, 500 etiquetas, 600 títulos y cifras. No uses 700+ salvo casos justificados.
6. **Sin `!important`** salvo para vencer estilos de etiquetas heredados (`.radio`, `.ai-overwrite`).
7. **Breakpoints:** 1024 px (métricas a 2 columnas), 860 px (la barra lateral pasa arriba), 640 px (teléfono), 400 px (teléfono chico).

## Estructura de una página

```tsx
<div className="mi-modulo">            {/* display:grid; gap: --space-6 */}
  <div className="page-header">
    <div>
      <button className="back-link">…</button>   {/* opcional */}
      <p className="eyebrow">SECCIÓN</p>
      <h1>Título</h1>
      <p>Descripción de una línea.</p>
    </div>
    <button className="secondary">Acción</button>  {/* o <div className="page-header-actions"> */}
  </div>
  <section className="admin-card">
    <div className="card-heading"><div><h2>…</h2><p>…</p></div></div>
    …
  </section>
</div>
```

## Botones

| Clase | Uso |
| --- | --- |
| `<button>` sin clase | Acción principal (una por vista) |
| `.secondary` | Acción secundaria, contorno neutro |
| `.back-link`, `.add`, `.detail-link` | Acciones de texto (volver, agregar fila, abrir detalle) |
| `.icon` | Botón de solo icono (eliminar, cerrar) |

## Tokens principales

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-primary` | `#0b5eb7` | Botón principal, enlaces, foco |
| `--color-text` / `-secondary` / `-muted` | slate 800 / 600 / 500 | Texto, etiquetas, ayudas |
| `--color-border` | `#e2e8f0` | Tarjetas y divisores |
| `--text-4xl` | 28 px | Título de página (`h1`) |
| `--text-3xl` | 24 px | Cifras de métricas |
| `--text-lg` | 16 px | Títulos de tarjeta (`h2`) |
| `--text-base` | 14 px | Texto normal |
| `--text-md` / `--text-sm` | 13 / 12 px | Etiquetas, ayudas, badges |
| `--space-6` | 24 px | Separación entre secciones y relleno de tarjeta |
| `--radius-md` / `--radius-lg` | 8 / 12 px | Controles / tarjetas |
