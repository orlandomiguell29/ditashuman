// Insignia de estado reutilizable — reemplaza el texto plano "Activo" /
// "Sí" / "No" en las tablas admin por una píldora de color, consistente
// con el resto de la interfaz (.tag, .badge-course).
export default function EstadoBadge({ children, variante = 'neutro' }) {
  return <span className={`badge-estado ${variante}`}>{children}</span>;
}
