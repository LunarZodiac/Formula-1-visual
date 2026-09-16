#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const required=['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'];
const missing=required.filter(name=>!process.env[name]);if(missing.length)throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
const circuitArgument=process.argv.find(value=>value.startsWith('--circuit='))?.slice(10)
  ??(process.argv.includes('--circuit')?process.argv[process.argv.indexOf('--circuit')+1]:null);
if(circuitArgument&&!/^[A-Za-z0-9_-]+$/.test(circuitArgument))throw new Error('Некорректный ID трассы');
const root=path.resolve(import.meta.dirname,'..'),outputDirectory=path.join(root,'apps','web','public','data','travel');
const client=new pg.Client();await client.connect();
try{
 const circuits=circuitArgument?[circuitArgument]:(await client.query('SELECT id FROM atlas.circuits ORDER BY id')).rows.map(row=>String(row.id));
 await mkdir(outputDirectory,{recursive:true});
 for(const circuitId of circuits){
  const result=await client.query(`SELECT feature FROM (
   SELECT jsonb_build_object('type','Feature','geometry',ST_AsGeoJSON(poi.location::geometry)::jsonb,'properties',jsonb_strip_nulls(jsonb_build_object(
    'featureType','poi','id',poi.id,'name',coalesce(poi.name_ru,poi.name),'role',link.role,'category',poi.category_id,'categoryIcon',category.icon,
    'minZoom',category.min_zoom,'priority',link.priority,'featured',link.is_featured,'reviewStatus',poi.review_status,
    'imageUrl',photo.image_url,'imageAltRu',photo.alt_text_ru,
    'zones',coalesce((SELECT jsonb_agg(zone.id ORDER BY zone_link.sort_order)FROM atlas.travel_zone_pois zone_link JOIN atlas.travel_zones zone ON zone.id=zone_link.zone_id WHERE zone_link.poi_id=poi.id AND zone.review_status IN('reviewed','published')),'[]'::jsonb)))) AS feature
   FROM atlas.circuit_travel_pois link JOIN atlas.tourism_pois poi ON poi.id=link.poi_id JOIN atlas.poi_categories category ON category.id=poi.category_id
   LEFT JOIN LATERAL(SELECT coalesce((SELECT derivative.url FROM atlas.media_asset_derivatives derivative WHERE derivative.media_asset_id=media.id ORDER BY CASE derivative.variant WHEN '640w'THEN 0 WHEN '1280w'THEN 1 ELSE 2 END LIMIT 1),media.url)AS image_url,media.alt_text_ru
    FROM atlas.media_assets media WHERE media.entity_type='tourism_poi'AND media.entity_id=poi.id AND media.media_type='image'AND media.rights_status='verified'AND media.review_status='published'ORDER BY media.is_primary DESC,media.id LIMIT 1)photo ON true
   WHERE link.circuit_id=$1 AND link.role<>'circuit' AND poi.review_status IN('reviewed','published')AND(link.is_featured OR(category.group_id='stay'AND EXISTS(SELECT 1 FROM atlas.travel_zone_pois zp JOIN atlas.travel_zones z ON z.id=zp.zone_id WHERE zp.poi_id=poi.id AND z.circuit_id=$1 AND z.review_status IN('reviewed','published'))))
   UNION ALL
   SELECT jsonb_build_object('type','Feature','geometry',ST_AsGeoJSON(zone.geometry::geometry)::jsonb,'properties',jsonb_build_object(
    'featureType','accommodation_zone','id',zone.id,'name',zone.name_ru,'priority',zone.priority,'bestFor',zone.best_for,'advantages',zone.advantages_ru,
    'disadvantages',zone.disadvantages_ru,'reviewStatus',zone.review_status,'hotelCount',(SELECT count(*)FROM atlas.travel_zone_pois zp WHERE zp.zone_id=zone.id),
    'exampleHotels',coalesce((SELECT jsonb_agg(coalesce(poi.name_ru,poi.name)ORDER BY zp.sort_order)FROM atlas.travel_zone_pois zp JOIN atlas.tourism_pois poi ON poi.id=zp.poi_id WHERE zp.zone_id=zone.id AND zp.is_example),'[]'::jsonb)) )
   FROM atlas.travel_zones zone WHERE zone.circuit_id=$1 AND zone.geometry IS NOT NULL AND zone.review_status IN('reviewed','published')
   UNION ALL
   SELECT jsonb_build_object('type','Feature','geometry',ST_AsGeoJSON(route.geometry::geometry)::jsonb,'properties',jsonb_strip_nulls(jsonb_build_object(
    'featureType','route','id',route.id,'name',route.name_ru,'routeType',route.route_type,'travelMode',route.travel_mode,'distanceM',route.distance_m,
    'durationMinutes',route.duration_minutes,'reviewStatus',route.review_status,'routeGroup',presentation.route_group,'color',presentation.line_colour,
    'lineOffset',presentation.line_offset_px,'minZoom',presentation.min_zoom,'maxZoom',presentation.max_zoom,'visibleByDefault',presentation.visible_by_default,
    'rationale',presentation.rationale_ru,'highlights',presentation.highlights_ru,'practicalNotes',presentation.practical_notes_ru)))
   FROM atlas.travel_routes route JOIN atlas.travel_route_presentations presentation ON presentation.route_id=route.id
   WHERE route.circuit_id=$1 AND route.geometry IS NOT NULL AND route.review_status='published'
  )exported ORDER BY feature->'properties'->>'featureType',feature->'properties'->>'name'`,[circuitId]);
  const features=result.rows.map(row=>row.feature),counts={poi:features.filter(f=>f.properties.featureType==='poi').length,zones:features.filter(f=>f.properties.featureType==='accommodation_zone').length,routes:features.filter(f=>f.properties.featureType==='route').length};
  const collection={type:'FeatureCollection',name:`${circuitId}-travel-public`,properties:{note:'Публичный туристический слой из PostgreSQL',counts},features};
  const output=path.join(outputDirectory,`${circuitId}.geojson`),temporary=`${output}.tmp-${process.pid}`;await writeFile(temporary,`${JSON.stringify(collection)}\n`,'utf8');await rename(temporary,output);
  console.log(`${circuitId}: ${counts.poi} точек, ${counts.zones} зон, ${counts.routes} маршрутов`);
 }
}finally{await client.end();}
