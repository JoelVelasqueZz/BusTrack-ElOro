export const MACHALA_CENTER = [-3.2586, -79.9606]
export const DEFAULT_ZOOM = 14

// Coordenadas de ejemplo — reemplazar por las rutas reales de Machala cuando se tengan.
export const ROUTES = [
  {
    id: 'ruta-1',
    name: 'Ruta 1 · Terminal - Centro - Unioro',
    color: '#e63946',
    stops: [
      { id: 'r1-terminal', name: 'Terminal Terrestre', lat: -3.2465, lng: -79.9698, order: 0 },
      { id: 'r1-parque', name: 'Parque Central', lat: -3.2586, lng: -79.9606, order: 1 },
      { id: 'r1-bolivar', name: 'Av. Bolívar', lat: -3.2632, lng: -79.9558, order: 2 },
      { id: 'r1-unioro', name: 'Unioro', lat: -3.2701, lng: -79.9487, order: 3 },
    ],
    path: [
      [-3.2465, -79.9698],
      [-3.2510, -79.9660],
      [-3.2586, -79.9606],
      [-3.2632, -79.9558],
      [-3.2665, -79.9520],
      [-3.2701, -79.9487],
    ],
  },
  {
    id: 'ruta-2',
    name: 'Ruta 2 · Puerto Bolívar - Centro',
    color: '#2a9d8f',
    stops: [
      { id: 'r2-puerto', name: 'Puerto Bolívar', lat: -3.2467, lng: -80.0058, order: 0 },
      { id: 'r2-mall', name: 'Machala Mall', lat: -3.2520, lng: -79.9820, order: 1 },
      { id: 'r2-parque', name: 'Parque Central', lat: -3.2586, lng: -79.9606, order: 2 },
      { id: 'r2-hospital', name: 'Hospital Teófilo Dávila', lat: -3.2625, lng: -79.9540, order: 3 },
    ],
    path: [
      [-3.2467, -80.0058],
      [-3.2495, -79.9940],
      [-3.2520, -79.9820],
      [-3.2555, -79.9710],
      [-3.2586, -79.9606],
      [-3.2625, -79.9540],
    ],
  },
]
