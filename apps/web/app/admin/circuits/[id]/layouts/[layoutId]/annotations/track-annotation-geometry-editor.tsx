'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { AdminTrackAnnotation } from '../../../../../../lib/admin-database';
import { addAtlasMapAttribution } from '../../../../../../lib/map-attribution';
import 'maplibre-gl/dist/maplibre-gl.css';

type AnnotationType=AdminTrackAnnotation['annotationType'];
type Geometry=AdminTrackAnnotation['geometryGeoJson'];
const pointTypes=new Set<AnnotationType>(['turn','timing_line','drs_detection']);
const labels:Record<AnnotationType,string>={sector:'Сектор',turn:'Поворот',straight:'Прямая',timing_line:'Отсечка времени',drs_zone:'Зона DRS',drs_detection:'Детекция DRS'};
const style:maplibregl.StyleSpecification={version:8,sources:{streets:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'&copy; OpenStreetMap contributors &copy; OpenFreeMap'}},layers:[
  {id:'background',type:'background',paint:{'background-color':'#07131b'}},{id:'land',type:'fill',source:'streets','source-layer':'landcover',paint:{'fill-color':'#132730','fill-opacity':.9}},
  {id:'water',type:'fill',source:'streets','source-layer':'water',paint:{'fill-color':'#02090e'}},{id:'roads',type:'line',source:'streets','source-layer':'transportation',paint:{'line-color':'#718690','line-width':['interpolate',['linear'],['zoom'],9,.3,17,2.2],'line-opacity':.32}},
]};
const empty={type:'FeatureCollection' as const,features:[]};
function featureCollection(annotations:AdminTrackAnnotation[]){return{type:'FeatureCollection' as const,features:annotations.map(item=>({type:'Feature' as const,properties:{id:item.id,type:item.annotationType,label:item.labelRu??item.labelOriginal??item.sequence??''},geometry:item.geometryGeoJson}))};}
function draftFeature(type:AnnotationType,coordinates:number[][]){if(pointTypes.has(type))return coordinates[0]?{type:'Feature' as const,properties:{},geometry:{type:'Point' as const,coordinates:coordinates[0]}}:null;return coordinates.length>=2?{type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates}}:null;}
function initialCoordinates(annotation:AdminTrackAnnotation|null){if(!annotation)return[];return annotation.geometryGeoJson.type==='Point'?[annotation.geometryGeoJson.coordinates]:annotation.geometryGeoJson.coordinates;}

export function TrackAnnotationGeometryEditor({centerline,annotations,selected}:{centerline:{type:'LineString';coordinates:number[][]};annotations:AdminTrackAnnotation[];selected:AdminTrackAnnotation|null}){
  const container=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),drawingRef=useRef(false),typeRef=useRef<AnnotationType>(selected?.annotationType??'turn');
  const[type,setType]=useState<AnnotationType>(selected?.annotationType??'turn'),[coordinates,setCoordinates]=useState<number[][]>(()=>initialCoordinates(selected)),[drawing,setDrawing]=useState(false);
  const geometry=useMemo<Geometry|null>(()=>pointTypes.has(type)?(coordinates[0]?{type:'Point',coordinates:coordinates[0]}:null):(coordinates.length>=2?{type:'LineString',coordinates}:null),[coordinates,type]);
  useEffect(()=>{drawingRef.current=drawing;mapRef.current?.getCanvas().style.setProperty('cursor',drawing?'crosshair':'');},[drawing]);
  useEffect(()=>{typeRef.current=type;},[type]);
  useEffect(()=>{if(!container.current)return;const map=new maplibregl.Map({container:container.current,style,center:centerline.coordinates[0] as[number,number],zoom:14,minZoom:7,maxZoom:20,renderWorldCopies:false,attributionControl:false});mapRef.current=map;map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');addAtlasMapAttribution(map);
    map.on('load',()=>{map.addSource('layout',{type:'geojson',data:{type:'Feature',properties:{},geometry:centerline}});map.addLayer({id:'layout',type:'line',source:'layout',paint:{'line-color':'#eef6f8','line-width':5,'line-opacity':.72}});
      map.addSource('annotations',{type:'geojson',data:featureCollection(annotations)});map.addLayer({id:'annotation-lines',type:'line',source:'annotations',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':['match',['get','type'],'sector','#58c7e8','straight','#f2c14e','drs_zone','#7fd98a','#a47cff'],'line-width':8,'line-opacity':.72}});
      map.addLayer({id:'annotation-points',type:'circle',source:'annotations',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['match',['get','type'],'turn','#ff3158','timing_line','#58c7e8','drs_detection','#7fd98a','#fff'],'circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      map.addSource('annotation-draft',{type:'geojson',data:empty});map.addLayer({id:'draft-line',type:'line',source:'annotation-draft',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#ff3158','line-width':6,'line-dasharray':[1.5,1]}});map.addLayer({id:'draft-point',type:'circle',source:'annotation-draft',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#ff3158','circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      const bounds=new maplibregl.LngLatBounds();centerline.coordinates.forEach(point=>bounds.extend(point as[number,number]));map.fitBounds(bounds,{padding:55,duration:0,maxZoom:17});});
    map.on('click',event=>{if(!drawingRef.current)return;const point=[Number(event.lngLat.lng.toFixed(7)),Number(event.lngLat.lat.toFixed(7))];setCoordinates(current=>pointTypes.has(typeRef.current)?[point]:[...current,point]);});return()=>{map.remove();mapRef.current=null};},[annotations,centerline]);
  useEffect(()=>{const source=mapRef.current?.getSource('annotation-draft') as GeoJSONSource|undefined;const feature=draftFeature(type,coordinates);source?.setData(feature??empty);},[coordinates,type]);
  const changeType=(next:AnnotationType)=>{if(pointTypes.has(next)!==pointTypes.has(type))setCoordinates([]);setType(next);};
  return <section className="admin-track-annotation-editor"><input type="hidden" name="geometryGeoJson" value={geometry?JSON.stringify(geometry):''}/><div className="admin-track-annotation-map" ref={container}/><aside>
    <label><span>Тип разметки</span><select name="annotationType" value={type} onChange={event=>changeType(event.target.value as AnnotationType)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <p>{pointTypes.has(type)?'Включите рисование и нажмите в нужной точке контура':'Последовательно поставьте не менее двух точек вдоль нужного участка контура'}</p>
    <button type="button" className={drawing?'is-active':''} onClick={()=>setDrawing(value=>!value)}>{drawing?'Завершить рисование':'Начать рисование'}</button>
    <div className="admin-track-digitizer-actions"><button type="button" disabled={!coordinates.length} onClick={()=>setCoordinates(current=>current.slice(0,-1))}>Отменить точку</button><button type="button" disabled={!coordinates.length} onClick={()=>setCoordinates([])}>Очистить</button></div>
    <output>{coordinates.length} {coordinates.length===1?'точка':'точек'} · {geometry?'геометрия готова':'нужно продолжить'}</output>
  </aside></section>;
}
