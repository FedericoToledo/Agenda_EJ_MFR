export const ROLES = [
  { id: 'superadmin', nombre: 'Administración' },
  { id: 'operador', nombre: 'Equipo' },
];

export const TURNO_ESTADOS = [
  { id: 'pendiente', nombre: 'Pendiente' },
  { id: 'confirmado', nombre: 'Confirmado' },
  { id: 'atendido', nombre: 'Atendido' },
  { id: 'cancelado', nombre: 'Cancelado' },
];

const presentadoEstados = [
  { id: 'presentado', nombre: 'Presentado' },
  { id: 'observado', nombre: 'Observado' },
  { id: 'a_subsanar', nombre: 'A subsanar' },
];

const reclamoEstados = [
  { id: 'abierto', nombre: 'Abierto' },
  { id: 'en_trato', nombre: 'En trato' },
  { id: 'judicializado', nombre: 'Judicializado' },
  { id: 'cerrado', nombre: 'Cerrado' },
];

export const AREAS = [
  {
    id: 'familia',
    nombre: 'Familia',
    resumen: 'Documentos, faltantes y lo ya presentado',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Fotos y archivos que ya están en el estudio.',
      },
      {
        id: 'faltante',
        nombre: 'Faltante',
        tipo: 'faltante',
        ayuda: 'Anotá lo que falta, uno por línea. Al tocarlo se abre la cámara: la foto pasa a Documentos y sale de esta lista.',
      },
      {
        id: 'presentado',
        nombre: 'Presentado',
        tipo: 'presentado',
        ayuda: 'Lo que ya se presentó ante el juzgado o el registro.',
        etiquetas: {
          titulo: 'Qué se presentó',
          cuerpo: 'Dónde y observaciones',
          fecha: 'Fecha',
          nuevo: 'Registrar presentación',
          tituloPh: 'Ej.: Demanda de alimentos',
        },
        estados: presentadoEstados,
      },
    ],
  },
  {
    id: 'accidente',
    nombre: 'Accidente',
    resumen: 'Documentos y reclamos',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Fotos del siniestro, presupuestos, historias clínicas y demás.',
      },
      {
        id: 'reclamos',
        nombre: 'Reclamos',
        tipo: 'ficha',
        ayuda: 'Cada reclamo, con su estado.',
        etiquetas: {
          titulo: 'Reclamo',
          cuerpo: 'Detalle',
          fecha: 'Fecha',
          nuevo: 'Nuevo reclamo',
          tituloPh: 'Ej.: Lesiones contra aseguradora',
        },
        estados: [
          ...reclamoEstados.slice(0, 3),
          { id: 'cobrado', nombre: 'Cobrado' },
          reclamoEstados[3],
        ],
      },
    ],
  },
  {
    id: 'vivienda',
    nombre: 'Vivienda',
    resumen: 'Documentos, reclamos y cartas documento',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Contratos, títulos, planos y fotos.',
      },
      {
        id: 'reclamos',
        nombre: 'Reclamos',
        tipo: 'ficha',
        ayuda: 'Reclamos por la vivienda.',
        etiquetas: {
          titulo: 'Reclamo',
          cuerpo: 'Detalle',
          fecha: 'Fecha',
          nuevo: 'Nuevo reclamo',
          tituloPh: 'Ej.: Filtraciones al consorcio',
        },
        estados: reclamoEstados,
      },
      {
        id: 'cartas',
        nombre: 'Cartas documento',
        tipo: 'ficha',
        ayuda: 'Cartas documento enviadas o recibidas.',
        etiquetas: {
          titulo: 'Destinatario',
          cuerpo: 'Texto o resumen',
          fecha: 'Fecha',
          nuevo: 'Nueva carta documento',
          tituloPh: 'Ej.: Locador, Av. San Martín 120',
        },
        estados: [
          { id: 'para_enviar', nombre: 'Para enviar' },
          { id: 'enviada', nombre: 'Enviada' },
          { id: 'recibida', nombre: 'Recibida' },
          { id: 'respondida', nombre: 'Respondida' },
        ],
      },
    ],
  },
  {
    id: 'casa_pueblo',
    nombre: 'Casa Pueblo',
    resumen: 'Documentos',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Documentos de Casa Pueblo.',
      },
    ],
  },
  {
    id: 'penal',
    nombre: 'Penal',
    resumen: 'Documentos y causa',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Escritos, cedulas y fotos del expediente.',
      },
      {
        id: 'causa',
        nombre: 'Causa',
        tipo: 'ficha',
        ayuda: 'Datos y movimiento de la causa.',
        etiquetas: {
          titulo: 'Carátula',
          cuerpo: 'Juzgado, fiscalía, detalle',
          fecha: 'Fecha',
          nuevo: 'Nueva causa',
          tituloPh: 'Ej.: Pérez s/ lesiones',
        },
        estados: [
          { id: 'investigacion', nombre: 'En investigación' },
          { id: 'procesada', nombre: 'Procesada' },
          { id: 'juicio', nombre: 'A juicio' },
          { id: 'sentencia', nombre: 'Sentencia' },
          { id: 'archivada', nombre: 'Archivada' },
        ],
      },
    ],
  },
  {
    id: 'cannabis',
    nombre: '420',
    resumen: 'Asociaciones, documentos y Reprocann',
    buckets: [
      {
        id: 'asociaciones',
        nombre: 'Asociaciones',
        tipo: 'ficha',
        ayuda: 'Asociaciones civiles y su estado.',
        etiquetas: {
          titulo: 'Asociación',
          cuerpo: 'Datos, autoridades, observaciones',
          fecha: 'Fecha',
          nuevo: 'Nueva asociación',
          tituloPh: 'Ej.: Asociación Cultivo Norte',
        },
        estados: [
          { id: 'en_formacion', nombre: 'En formación' },
          { id: 'activa', nombre: 'Activa' },
          { id: 'observada', nombre: 'Observada' },
          { id: 'baja', nombre: 'Baja' },
        ],
      },
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Estatutos, actas, DNIs y demás papeles.',
      },
      {
        id: 'reprocann',
        nombre: 'Reprocann',
        tipo: 'ficha',
        ayuda: 'Seguimiento de cada trámite de Reprocann.',
        etiquetas: {
          titulo: 'Trámite',
          cuerpo: 'Paciente, cultivador, vínculo, observaciones',
          fecha: 'Fecha',
          nuevo: 'Nuevo trámite',
          tituloPh: 'Ej.: Renovación de Ana Pérez',
        },
        estados: [
          { id: 'iniciado', nombre: 'Iniciado' },
          { id: 'en_tramite', nombre: 'En trámite' },
          { id: 'observado', nombre: 'Observado' },
          { id: 'otorgado', nombre: 'Otorgado' },
          { id: 'rechazado', nombre: 'Rechazado' },
          { id: 'vencido', nombre: 'Vencido' },
        ],
      },
    ],
  },
  {
    id: 'civil',
    nombre: 'Civil',
    resumen: 'Documentos y demandas',
    buckets: [
      {
        id: 'documentos',
        nombre: 'Documentos',
        tipo: 'archivo',
        ayuda: 'Pruebas, escritos y fotos.',
      },
      {
        id: 'demandas',
        nombre: 'Demandas',
        tipo: 'ficha',
        ayuda: 'Demandas y el estado de cada una.',
        etiquetas: {
          titulo: 'Demanda',
          cuerpo: 'Juzgado, objeto, observaciones',
          fecha: 'Fecha',
          nuevo: 'Nueva demanda',
          tituloPh: 'Ej.: Daños y perjuicios',
        },
        estados: [
          { id: 'preparacion', nombre: 'En preparación' },
          { id: 'presentada', nombre: 'Presentada' },
          { id: 'en_tramite', nombre: 'En trámite' },
          { id: 'sentencia', nombre: 'Sentencia' },
          { id: 'ejecucion', nombre: 'En ejecución' },
          { id: 'archivada', nombre: 'Archivada' },
        ],
      },
    ],
  },
];

export function areaById(id) {
  return AREAS.find((area) => area.id === id) || null;
}

export function bucketById(areaId, bucketId) {
  return areaById(areaId)?.buckets.find((bucket) => bucket.id === bucketId) || null;
}
