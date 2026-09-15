// Regenerates src/constants/pueblo-shapes.ts from pr-municipios.geojson.
//
// Source: commonwealth-of-puerto-rico/crime-spotter (public/data/municipalities.geojson),
// https://github.com/commonwealth-of-puerto-rico/crime-spotter
// Each feature carries STATE="72" (Puerto Rico's Census FIPS code) and a COUNTY FIPS
// code, which is how the U.S. Census Bureau's TIGER/Line cartographic boundary files
// identify Puerto Rico's 78 municipios (the Census treats them as county-equivalents).
// That structure is how this was confirmed to be real Census-derived boundary data
// rather than a hand-drawn approximation. Verified: 78 features, 78 unique COUNTY
// codes, and every municipio name matches supabase/seed.sql's pueblos list exactly
// (accents included) both by name and by the same slugify() used to seed that table.
//
// Run with: node scripts/geo/generate-pueblo-shapes.js

const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, 'pr-municipios.geojson');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'constants', 'pueblo-shapes.ts');
const VIEWBOX_WIDTH = 1000;
const PADDING = 20;

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const geo = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));

let minLon = Infinity;
let maxLon = -Infinity;
let minLat = Infinity;
let maxLat = -Infinity;
for (const feature of geo.features) {
  for (const ring of feature.geometry.coordinates) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
}

// Equirectangular projection: PR is small (~0.6 deg lat, ~2 deg lon) and near
// 18.3N, so correcting longitude by cos(centerLat) keeps shapes undistorted
// without needing a heavier map projection.
const centerLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
const cosLat = Math.cos(centerLatRad);
const projectX = (lon) => (lon - minLon) * cosLat;
const projectY = (lat) => maxLat - lat; // flip: north stays up in screen space

let minProjX = Infinity;
let maxProjX = -Infinity;
let minProjY = Infinity;
let maxProjY = -Infinity;
for (const feature of geo.features) {
  for (const ring of feature.geometry.coordinates) {
    for (const [lon, lat] of ring) {
      const x = projectX(lon);
      const y = projectY(lat);
      if (x < minProjX) minProjX = x;
      if (x > maxProjX) maxProjX = x;
      if (y < minProjY) minProjY = y;
      if (y > maxProjY) maxProjY = y;
    }
  }
}

const scale = (VIEWBOX_WIDTH - PADDING * 2) / (maxProjX - minProjX);
const viewBoxHeight = Math.round((maxProjY - minProjY) * scale + PADDING * 2);

function toScreen(lon, lat) {
  const x = (projectX(lon) - minProjX) * scale + PADDING;
  const y = (projectY(lat) - minProjY) * scale + PADDING;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

const shapes = geo.features
  .map((feature) => {
    const name = feature.properties.NAME;
    const slug = slugify(name);

    let d = '';
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const ring of feature.geometry.coordinates) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = toScreen(lon, lat);
        d += `${i === 0 ? 'M' : 'L'}${x},${y} `;
        sumX += x;
        sumY += y;
        count += 1;
      });
      d += 'Z ';
    }

    return {
      slug,
      name,
      path: d.trim(),
      labelX: Math.round((sumX / count) * 100) / 100,
      labelY: Math.round((sumY / count) * 100) / 100,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const header = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/geo/generate-pueblo-shapes.js
// Source data: scripts/geo/pr-municipios.geojson (see that script for provenance).

export type PuebloShape = {
  slug: string;
  name: string;
  path: string;
  labelX: number;
  labelY: number;
};

export const PUEBLO_MAP_VIEWBOX = { width: ${VIEWBOX_WIDTH}, height: ${viewBoxHeight} };

export const PUEBLO_SHAPES: PuebloShape[] = ${JSON.stringify(shapes, null, 2)};
`;

fs.writeFileSync(OUTPUT_PATH, header);
console.log(`Wrote ${shapes.length} pueblo shapes to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
console.log(`viewBox: 0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`);
