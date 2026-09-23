import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosClient';
import Paginator from '../../components/Paginator';
import { usePaginacion } from '../../hooks/usePaginacion';

// Debe coincidir con MAX_INTENTOS_QUIZ del backend (colaboradorController.js)
// — se usa solo como valor de respaldo para la leyenda antes de que llegue
// el primer resultado del backend (que ya trae `maxIntentos` real).
const MAX_INTENTOS_QUIZ = 2;

// Extrae el ID de video de cualquier formato común de URL de YouTube
// (watch?v=, youtu.be/, /embed/) para poder incrustarlo con el reproductor
// oficial de YouTube (iframe), sin depender de un player propio.
function idYoutube(url) {
  if (!url) return null;
  const patrones = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /\/embed\/([^?&]+)/];
  for (const patron of patrones) {
    const match = url.match(patron);
    if (match) return match[1];
  }
  return null;
}

// Carga el script del IFrame Player API de YouTube UNA sola vez para toda
// la página (si ya está cargado por otra instancia, lo reutiliza). Se
// necesita para poder escuchar el evento "el video terminó" y avanzar el
// progreso automáticamente, sin que el colaborador tenga que dar clic en
// un botón aparte cada vez que termina de ver uno.
function useYoutubeApiListo() {
  const [listo, setListo] = useState(Boolean(window.YT?.Player));

  useEffect(() => {
    if (window.YT?.Player) {
      setListo(true);
      return;
    }
    const previo = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previo?.();
      setListo(true);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  }, []);

  return listo;
}

export default function ColaboradorAcademia() {
  const navigate = useNavigate();
  const [cursos, setCursos] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(null);
  const [videoAbierto, setVideoAbierto] = useState(null); // { cursoId, videoId, inscripcionId }
  const ytApiListo = useYoutubeApiListo();
  const playerRef = useRef(null);

  // Evaluación final: el certificado ya no se activa solo con ver todos los
  // videos (ver colaboradorController.evaluarFinalizacionCurso) — hace
  // falta además aprobarla con 70% o más. `respuestasQuiz` guarda las
  // respuestas en curso por curso (clave = cursoId), y `resultadoQuiz` el
  // resultado del último intento por inscripción, para mostrar el puntaje
  // y permitir reintentar si no se aprobó.
  const [respuestasQuiz, setRespuestasQuiz] = useState({});
  const [resultadoQuiz, setResultadoQuiz] = useState({});
  const [enviandoQuiz, setEnviandoQuiz] = useState(null);
  // Videos cuyo reproductor de YouTube reportó un error (onError de la
  // IFrame API): el video real puede estar disponible en YouTube.com pero
  // rechazar la reproducción incrustada por distintos motivos — el dueño
  // desactivó la incrustación (error 101/150), el video se eliminó o es
  // privado (100/2), o un bloqueador de anuncios/filtro corporativo del
  // navegador intercepta el iframe. Antes, en cualquiera de estos casos, el
  // colaborador se quedaba viendo el mensaje genérico de YouTube ("Este
  // contenido está bloqueado…") dentro de un reproductor roto, sin ninguna
  // salida clara. Ahora se detecta el error y se reemplaza por un aviso
  // propio con el enlace directo a YouTube.
  const [videosConError, setVideosConError] = useState(() => new Set());

  // Paginación del catálogo de cursos (en el cliente): crece con cada curso
  // que se agregue desde Admin > Cursos.
  const paginacionCursos = usePaginacion({ clave: 'colaborador-academia-cursos' });

  function cargar() {
    api
      .get('/colaborador/academia')
      .then((res) => {
        setCursos(res.data.data.cursos);
        setInscripciones(res.data.data.inscripciones);
      })
      .catch((err) => setError(err.response?.data?.error || 'No fue posible cargar la academia.'));
  }

  useEffect(cargar, []);

  async function inscribir(cursoId) {
    try {
      await api.post(`/colaborador/academia/${cursoId}/inscribir`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible inscribirte al curso.');
    }
  }

  // Marca el video puntual como visto (no un porcentaje arbitrario): el
  // backend recalcula el progreso real como videos vistos / total de
  // videos del curso. Al ver el último video, el backend marca el curso
  // como completado y habilita el certificado (descargable desde Mi
  // Expediente, no aquí).
  async function marcarVisto(inscripcionId, videoId) {
    setActualizando(videoId);
    setError('');
    try {
      await api.patch(`/colaborador/academia/inscripciones/${inscripcionId}/videos/${videoId}/visto`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible actualizar tu progreso.');
    } finally {
      setActualizando(null);
    }
  }

  async function enviarQuiz(cursoId, inscripcionId, preguntas) {
    const respuestas = respuestasQuiz[cursoId] || {};
    if (Object.keys(respuestas).length !== preguntas.length) {
      setError('Responde todas las preguntas de la evaluación antes de enviarla.');
      return;
    }
    setEnviandoQuiz(cursoId);
    setError('');
    try {
      const cuerpo = { respuestas: preguntas.map((p) => ({ preguntaId: p.id, opcionElegida: Number(respuestas[p.id]) })) };
      const { data } = await api.post(`/colaborador/academia/inscripciones/${inscripcionId}/evaluacion`, cuerpo);
      setResultadoQuiz((prev) => ({ ...prev, [inscripcionId]: data.data }));
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible enviar la evaluación.');
    } finally {
      setEnviandoQuiz(null);
    }
  }

  const inscripcionDe = (cursoId) => inscripciones.find((i) => i.curso_id === cursoId);
  const videosVistosDe = (inscripcion) => new Set((inscripcion?.InscripcionCursoVideos || []).map((v) => v.curso_video_id));

  // Crea el reproductor de YouTube con la API habilitada para el video que
  // se acaba de abrir, y escucha cuándo termina (ENDED) para marcar el
  // progreso automáticamente — así el avance no depende de que el
  // colaborador se acuerde de dar clic en "Marcar como visto".
  //
  // Importante: se construye el player con `new YT.Player(elementId, {
  // videoId, ... })` sobre un <div> VACÍO (no sobre un <iframe> ya
  // declarado con su propio `src`). "Adoptar" un iframe existente es un uso
  // no documentado de la API que en la práctica falla en bastantes
  // combinaciones de navegador/red corporativa (el evento `onStateChange`
  // nunca llega porque el postMessage interno no encuentra el `origin`
  // esperado). Dejar que la propia API cree el iframe desde cero es la
  // forma oficial y la que YouTube garantiza que funciona.
  useEffect(() => {
    if (!videoAbierto || !ytApiListo) return undefined;
    const { videoId, ytId, inscripcionId } = videoAbierto;
    const elementId = `yt-player-${videoId}`;
    if (!document.getElementById(elementId)) return undefined;

    let player;
    try {
      player = new window.YT.Player(elementId, {
        videoId: ytId,
        host: 'https://www.youtube.com',
        playerVars: { origin: window.location.origin, rel: 0 },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              marcarVisto(inscripcionId, videoId);
            }
          },
          // Códigos de error de la IFrame API: 101 y 150 = el dueño del
          // video desactivó la incrustación en otros sitios; 100/2 = video
          // eliminado, privado o ID inválido. En cualquier caso, YouTube
          // dibuja DENTRO del iframe su propio mensaje genérico ("Este
          // contenido está bloqueado…"), que no se puede personalizar ni
          // ocultar desde afuera — lo único que sí se puede hacer es dejar
          // de mostrar ese iframe y ofrecer el enlace directo a YouTube.
          onError: () => {
            setVideosConError((prev) => new Set(prev).add(videoId));
          },
        },
      });
      playerRef.current = player;
    } catch {
      // Si por lo que sea la API no logra crear el player (bloqueada por
      // una extensión, red restringida, etc.), no rompe la página: el
      // colaborador siempre tiene el enlace "Abrir en YouTube" y el botón
      // de marcar manualmente como respaldo (ver el render de abajo).
    }

    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoAbierto, ytApiListo]);

  return (
    <div>
      <h2>Academia DITASH: Cursos e Inteligencia Artificial</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="courses-grid">
        {cursos
          .slice((paginacionCursos.pagina - 1) * paginacionCursos.tamanoPagina, paginacionCursos.pagina * paginacionCursos.tamanoPagina)
          .map((cur) => {
          const inscripcion = inscripcionDe(cur.id);
          const videos = cur.CursoVideos || [];
          const totalVideos = videos.length;
          const vistos = videosVistosDe(inscripcion);
          const preguntas = cur.CursoPreguntas || [];
          const todosLosVideosVistos = totalVideos > 0 && vistos.size >= totalVideos;
          const evaluacionPendiente = todosLosVideosVistos && preguntas.length > 0 && inscripcion && !inscripcion.quiz_aprobado;
          const resultado = inscripcion ? resultadoQuiz[inscripcion.id] : null;

          return (
            <div key={cur.id} className="course-card">
              <div className="badge-course">{cur.otorga_certificado ? 'Incluye Certificado' : 'Sin certificado'}</div>
              <h4>{cur.titulo}</h4>
              <p>Duración: {cur.duracion_horas} hrs | {totalVideos} Videos</p>

              {!inscripcion && (
                <button className="btn-secondary" onClick={() => inscribir(cur.id)}>Iniciar Aprendizaje</button>
              )}

              {inscripcion && inscripcion.estado !== 'completado' && (
                <div style={{ marginTop: 10 }}>
                  <div className="progreso-barra">
                    <div className="progreso-relleno" style={{ width: `${inscripcion.progreso_pct}%` }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>
                    {vistos.size} de {totalVideos} videos vistos ({inscripcion.progreso_pct}%)
                  </p>

                  {totalVideos === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Este curso todavía no tiene videos cargados.</p>
                  )}

                  <ul className="simple-list">
                    {videos.map((v, idx) => {
                      const visto = vistos.has(v.id);
                      const abierto = videoAbierto?.cursoId === cur.id && videoAbierto?.videoId === v.id;
                      const yid = idYoutube(v.url_youtube);
                      return (
                        <li key={v.id} style={{ display: 'block', padding: '8px 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span>
                              {visto && <span className="tag">✔</span>} {idx + 1}. {v.titulo}
                              {v.duracion_minutos ? ` (${v.duracion_minutos} min)` : ''}
                            </span>
                            <button
                              type="button"
                              className="btn-xs"
                              onClick={() => {
                                // Reintentar reabrir el video limpia su estado de error
                                // previo, por si fue un bloqueo puntual (extensión del
                                // navegador, red) y no algo permanente del video.
                                setVideosConError((prev) => {
                                  if (!prev.has(v.id)) return prev;
                                  const copia = new Set(prev);
                                  copia.delete(v.id);
                                  return copia;
                                });
                                setVideoAbierto(abierto ? null : { cursoId: cur.id, videoId: v.id, ytId: yid, inscripcionId: inscripcion.id });
                              }}
                            >
                              {abierto ? 'Ocultar video' : visto ? 'Ver de nuevo' : 'Ver video'}
                            </button>
                          </div>
                          {abierto && yid && videosConError.has(v.id) && (
                            <div className="alert-error" style={{ marginTop: 8, maxWidth: 480 }}>
                              Este video no se pudo reproducir aquí (puede deberse a un bloqueador de anuncios, un filtro de
                              red corporativa, o a que su incrustación fue desactivada).{' '}
                              <a href={`https://www.youtube.com/watch?v=${yid}`} target="_blank" rel="noreferrer">
                                Ábrelo directamente en YouTube ↗
                              </a>{' '}
                              y luego usa "Márcalo manualmente" abajo para registrar tu avance.
                            </div>
                          )}
                          {abierto && yid && !videosConError.has(v.id) && (
                            <>
                              <div style={{ marginTop: 8, aspectRatio: '16 / 9', maxWidth: 480 }}>
                                {ytApiListo ? (
                                  // Contenedor vacío: la API de YouTube crea el iframe real
                                  // dentro de este div (ver el useEffect de arriba). Así se
                                  // garantiza que el evento "video terminado" funcione, algo
                                  // que NO estaba garantizado al reusar un <iframe> ya armado
                                  // a mano.
                                  <div id={`yt-player-${v.id}`} style={{ width: '100%', height: '100%' }} />
                                ) : (
                                  // Respaldo mientras carga (o si nunca carga, p. ej. por un
                                  // bloqueador de anuncios o una red corporativa restrictiva)
                                  // el script de la API de YouTube: el video igual se ve y se
                                  // puede reproducir, solo que el avance automático no aplica
                                  // y hay que usar "Márcalo manualmente" abajo.
                                  <iframe
                                    width="100%"
                                    height="100%"
                                    src={`https://www.youtube.com/embed/${yid}`}
                                    title={v.titulo}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                )}
                              </div>
                              <p style={{ fontSize: 11, marginTop: 6 }}>
                                <a href={`https://www.youtube.com/watch?v=${yid}`} target="_blank" rel="noreferrer">
                                  ¿No carga el video aquí? Ábrelo directamente en YouTube ↗
                                </a>
                              </p>
                            </>
                          )}
                          {abierto && yid && !visto && (
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                              El avance se registra solo al terminar el video. ¿Ya lo viste completo y no se marcó?{' '}
                              <button
                                type="button"
                                className="btn-link"
                                style={{ fontSize: 11 }}
                                disabled={actualizando === v.id}
                                onClick={() => marcarVisto(inscripcion.id, v.id)}
                              >
                                Márcalo manualmente
                              </button>
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {totalVideos > 0 && vistos.size < totalVideos && preguntas.length > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                      🔒 La evaluación final se habilita cuando termines de ver todos los videos.
                    </p>
                  )}

                  {evaluacionPendiente && (() => {
                    const intentosUsados = resultado?.intentosUsados ?? inscripcion.quiz_intentos ?? 0;
                    const maxIntentos = resultado?.maxIntentos ?? MAX_INTENTOS_QUIZ;
                    const intentosAgotados = intentosUsados >= maxIntentos;
                    return (
                    <div className="exp-section" style={{ marginTop: 14 }}>
                      <h4 style={{ marginTop: 0 }}>Evaluación final</h4>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Responde correctamente al menos el 70% para aprobar y desbloquear tu certificado. Tienes máximo{' '}
                        <strong>{maxIntentos} intentos</strong> ({intentosUsados} de {maxIntentos} usados).
                      </p>

                      {resultado && (
                        <div className={resultado.aprobado ? 'alert-success' : 'alert-error'} style={{ marginBottom: 12 }}>
                          Obtuviste <strong>{resultado.puntaje}%</strong> ({resultado.puntajeMinimo}% mínimo para aprobar).{' '}
                          {resultado.aprobado
                            ? '¡Aprobaste! Ya puedes descargar tu certificado en Mi Expediente.'
                            : intentosAgotados
                            ? `Usaste tus ${maxIntentos} intentos sin aprobar. Contacta a RRHH si necesitas un intento adicional.`
                            : 'Repasa los videos y vuelve a intentarlo.'}
                        </div>
                      )}

                      {intentosAgotados && !resultado?.aprobado && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          🔒 Ya no puedes reintentar esta evaluación desde aquí.
                        </p>
                      )}

                      {!resultado?.aprobado && !intentosAgotados && (
                        <form
                          className="form-grid"
                          onSubmit={(e) => {
                            e.preventDefault();
                            enviarQuiz(cur.id, inscripcion.id, preguntas);
                          }}
                        >
                          {preguntas.map((p, idx) => (
                            <div key={p.id} style={{ marginTop: idx === 0 ? 0 : 10 }}>
                              <label>{idx + 1}. {p.texto}</label>
                              <div style={{ marginTop: 6 }}>
                                {p.opciones.map((o, i) => (
                                  <label key={i} className="checkbox-label" style={{ display: 'flex', marginTop: 4 }}>
                                    <input
                                      type="radio"
                                      name={`quiz-${cur.id}-${p.id}`}
                                      checked={respuestasQuiz[cur.id]?.[p.id] === i}
                                      onChange={() =>
                                        setRespuestasQuiz((prev) => ({ ...prev, [cur.id]: { ...prev[cur.id], [p.id]: i } }))
                                      }
                                    />
                                    {o}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          <button className="btn-primary" type="submit" disabled={enviandoQuiz === cur.id} style={{ marginTop: 15 }}>
                            {enviandoQuiz === cur.id ? 'Enviando…' : 'Enviar evaluación'}
                          </button>
                        </form>
                      )}
                    </div>
                    );
                  })()}
                </div>
              )}

              {inscripcion && inscripcion.estado === 'completado' && (
                <div style={{ marginTop: 10 }}>
                  <span className="tag">✔ Curso completado</span>
                  {inscripcion.certificado_url && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      Certificado disponible para descargar en{' '}
                      <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => navigate('/colaborador/expediente')}>
                        Mi Expediente
                      </button>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Paginator
        page={paginacionCursos.pagina}
        totalItems={cursos.length}
        pageSize={paginacionCursos.tamanoPagina}
        onPageChange={paginacionCursos.setPagina}
        onPageSizeChange={paginacionCursos.cambiarTamanoPagina}
      />
    </div>
  );
}
