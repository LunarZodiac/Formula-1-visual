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
export const trackAnnotationMapStyle:maplibregl.StyleSpecification={version:8,sources:{streets:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'&copy; OpenStreetMap contributors &copy; OpenFreeMap'}},layers:[
  {id:'background',type:'background',paint:{'background-color':'#07131b'}},{id:'land',type:'fill',source:'streets','source-layer':'landcover',paint:{'fill-color':'#132730','fill-opacity':.9}},
  {id:'water',type:'fill',source:'streets','source-layer':'water',paint:{'fill-color':'#02090e'}},{id:'roads',type:'line',source:'streets','source-layer':'transportation',paint:{'line-color':'#718690','line-width':['interpolate',['linear'],['zoom'],9,.3,17,2.2],'line-opacity':.32}},
]};
const empty={type:'FeatureCollection' as const,features:[]};
function featureCollection(annotations:AdminTrackAnnotation[]){return{type:'FeatureCollection' as const,features:annotations.map(item=>({type:'Feature' as const,properties:{id:item.id,type:item.annotationType,sequence:item.sequence,label:item.labelRu??item.labelOriginal??item.sequence??''},geometry:item.geometryGeoJson}))};}
type TrackSnap={point:number[];segment:number;position:number};
function nearestTrackPoint(centerline:number[][],candidate:number[]):TrackSnap{
  let best:TrackSnap={point:centerline[0]??candidate,segment:0,position:0},bestDistance=Number.POSITIVE_INFINITY;
  const latitudeScale=Math.cos((candidate[1]??0)*Math.PI/180);
  for(let index=0;index<centerline.length-1;index+=1){
    const start=centerline[index],end=centerline[index+1];
    const dx=(end[0]-start[0])*latitudeScale,dy=end[1]-start[1];
    const lengthSquared=dx*dx+dy*dy;
    const projection=lengthSquared===0?0:Math.max(0,Math.min(1,(((candidate[0]-start[0])*latitudeScale)*dx+(candidate[1]-start[1])*dy)/lengthSquared));
    const point=[start[0]+(end[0]-start[0])*projection,start[1]+(end[1]-start[1])*projection];
    const distance=((candidate[0]-point[0])*latitudeScale)**2+(candidate[1]-point[1])**2;
    if(distance<bestDistance){bestDistance=distance;best={point:point.map(value=>Number(value.toFixed(7))),segment:index,position:index+projection};}
  }
  return best;
}
function samePoint(first:number[]|undefined,last:number[]|undefined){return Boolean(first&&last&&Math.abs(first[0]-last[0])<1e-7&&Math.abs(first[1]-last[1])<1e-7);}
function forwardTrackSlice(centerline:number[][],start:TrackSnap,end:TrackSnap,closed:boolean){
  if(start.position<=end.position)return[start.point,...centerline.slice(start.segment+1,end.segment+1),end.point];
  if(closed)return[start.point,...centerline.slice(start.segment+1,-1),...centerline.slice(1,end.segment+1),end.point];
  return[end.point,...centerline.slice(end.segment+1,start.segment+1),start.point].reverse();
}
function trackSlice(centerline:number[][],anchors:number[][],alternate:boolean){
  if(anchors.length<2)return[];
  const start=nearestTrackPoint(centerline,anchors[0]),end=nearestTrackPoint(centerline,anchors[1]);
  const closed=samePoint(centerline[0],centerline.at(-1));
  if(alternate&&closed)return forwardTrackSlice(centerline,end,start,true).reverse();
  return forwardTrackSlice(centerline,start,end,closed);
}
function initialCoordinates(annotation:AdminTrackAnnotation|null){if(!annotation)return[];if(annotation.geometryGeoJson.type==='Point')return[annotation.geometryGeoJson.coordinates];const coordinates=annotation.geometryGeoJson.coordinates;return coordinates.length>=2?[coordinates[0],coordinates.at(-1)!]:coordinates;}

export function TrackAnnotationGeometryEditor({centerline,annotations,selected}:{centerline:{type:'LineString';coordinates:number[][]};annotations:AdminTrackAnnotation[];selected:AdminTrackAnnotation|null}){
  const container=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),drawingRef=useRef(false),typeRef=useRef<AnnotationType>(selected?.annotationType??'turn');
  const[type,setType]=useState<AnnotationType>(selected?.annotationType??'turn'),[coordinates,setCoordinates]=useState<number[][]>(()=>initialCoordinates(selected)),[drawing,setDrawing]=useState(false),[alternate,setAlternate]=useState(false);
  const geometry=useMemo<Geometry|null>(()=>pointTypes.has(type)?(coordinates[0]?{type:'Point',coordinates:nearestTrackPoint(centerline.coordinates,coordinates[0]).point}:null):(coordinates.length>=2?{type:'LineString',coordinates:trackSlice(centerline.coordinates,coordinates,alternate)}:null),[alternate,centerline.coordinates,coordinates,type]);
  useEffect(()=>{drawingRef.current=drawing;mapRef.current?.getCanvas().style.setProperty('cursor',drawing?'crosshair':'');},[drawing]);
  useEffect(()=>{typeRef.current=type;},[type]);
  useEffect(()=>{if(!container.current)return;const map=new maplibregl.Map({container:container.current,style:trackAnnotationMapStyle,center:centerline.coordinates[0] as[number,number],zoom:14,minZoom:7,maxZoom:20,renderWorldCopies:false,attributionControl:false});mapRef.current=map;map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');addAtlasMapAttribution(map);
    map.on('load',()=>{map.addSource('layout',{type:'geojson',data:{type:'Feature',properties:{},geometry:centerline}});map.addLayer({id:'layout',type:'line',source:'layout',paint:{'line-color':'#eef6f8','line-width':5,'line-opacity':.72}});
      map.addSource('annotations',{type:'geojson',data:featureCollection(annotations)});map.addLayer({id:'annotation-lines',type:'line',source:'annotations',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':['case',['==',['get','type'],'sector'],['match',['get','sequence'],1,'#ff3158',2,'#58c7e8',3,'#f2c14e','#a47cff'],['match',['get','type'],'straight','#f2c14e','drs_zone','#7fd98a','#a47cff']],'line-width':8,'line-opacity':.72}});
      map.addLayer({id:'annotation-points',type:'circle',source:'annotations',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['match',['get','type'],'turn','#ff3158','timing_line','#58c7e8','drs_detection','#7fd98a','#fff'],'circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      map.addSource('annotation-draft',{type:'geojson',data:empty});map.addLayer({id:'draft-line',type:'line',source:'annotation-draft',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#ff3158','line-width':6,'line-dasharray':[1.5,1]}});map.addLayer({id:'draft-point',type:'circle',source:'annotation-draft',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#ff3158','circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      const bounds=new maplibregl.LngLatBounds();centerline.coordinates.forEach(point=>bounds.extend(point as[number,number]));map.fitBounds(bounds,{padding:55,duration:0,maxZoom:17});});
    map.on('click',event=>{if(!drawingRef.current)return;const clicked=[event.lngLat.lng,event.lngLat.lat];const point=nearestTrackPoint(centerline.coordinates,clicked).point;setAlternate(false);setCoordinates(current=>pointTypes.has(typeRef.current)?[point]:current.length<2?[...current,point]:[point]);});return()=>{map.remove();mapRef.current=null};},[annotations,centerline]);
  useEffect(()=>{const source=mapRef.current?.getSource('annotation-draft') as GeoJSONSource|undefined;source?.setData(geometry?{type:'Feature',properties:{},geometry}:empty);},[geometry]);
  const changeType=(next:AnnotationType)=>{if(pointTypes.has(next)!==pointTypes.has(type))setCoordinates([]);setAlternate(false);setType(next);};
  return <section className="admin-track-annotation-editor"><input type="hidden" name="geometryGeoJson" value={geometry?JSON.stringify(geometry):''}/><div className="admin-track-annotation-map" ref={container}/><aside>
    <label><span>Тип разметки</span><select name="annotationType" value={type} onChange={event=>changeType(event.target.value as AnnotationType)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <p>{pointTypes.has(type)?'Нажмите рядом с контуром — точка автоматически прилипнет к оси трассы':'Поставьте начало и конец — участок автоматически пройдёт точно по оси трассы'}</p>
    <button type="button" className={drawing?'is-active':''} onClick={()=>setDrawing(value=>!value)}>{drawing?'Завершить рисование':'Начать рисование'}</button>
    <div className="admin-track-digitizer-actions"><button type="button" disabled={!coordinates.length} onClick={()=>setCoordinates(current=>current.slice(0,-1))}>Отменить точку</button>{!pointTypes.has(type)&&coordinates.length===2&&samePoint(centerline.coordinates[0],centerline.coordinates.at(-1))?<button type="button" onClick={()=>setAlternate(value=>!value)}>{alternate?'Основной участок':'Другой участок кольца'}</button>:null}<button type="button" disabled={!coordinates.length} onClick={()=>setCoordinates([])}>Очистить</button></div>
    <output>{coordinates.length} {coordinates.length===1?'опорная точка':'опорные точки'} · {geometry?'геометрия готова':'нужно продолжить'}</output>
  </aside></section>;
}
