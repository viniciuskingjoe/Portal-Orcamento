export default function Botao({ children, variante = "primario", className = "", ...props }) {
  return (
    <button type="button" className={`botao botao--${variante} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
