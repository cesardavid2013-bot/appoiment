/**
 * Whether search-box text reads like a request ("barber tomorrow after 5",
 * "uñas el sábado") rather than a keyword. The assistant understands English
 * and Spanish whatever the interface language, so both are recognised here.
 */
const REQUEST_HINT =
  /\b(today|tonight|tomorrow|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|near me|under \$?\d|after \d|before \d|hoy|mañana|manana|tarde|noche|fin de semana|sábado|sabado|domingo|lunes|martes|miércoles|miercoles|jueves|viernes|cerca|menos de|despu[eé]s de|antes de|quiero|necesito|busco)\b/i;

export function looksLikeRequest(q: string) {
  const t = q.trim();
  return t.split(/\s+/).length >= 3 && REQUEST_HINT.test(t);
}
