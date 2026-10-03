'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { AdminTrackAnnotation } from '../../../../../../lib/admin-database';
import { useUnifiedTrackAnnotationMap } from './unified-track-annotation-map';

type AnnotationType=AdminTrackAnnotation['annotationType'];
type Geometry=AdminTrackAnnotation['geometryGeoJson'];
const pointTypes=new Set<AnnotationType>(['turn','timing_line','drs_detection','straight_mode_activation','straight_mode_low_grip_activation','overtake_detection','overtake_activation']);
const labels:Record<AnnotationType,string>={sector:'Сектор',turn:'Поворот',straight:'Прямая',timing_line:'Отсечка времени',drs_zone:'Зона DRS',drs_detection:'Детекция DRS',straight_mode_zone:'Straight Mode · участок',straight_mode_activation:'Straight Mode · активация',straight_mode_low_grip_activation:'Straight Mode · низкое сцепление',overtake_detection:'Overtake Mode · детекция',overtake_activation:'Overtake Mode · активация'};
function draftColor(type:AnnotationType,sequence?:number|string|null){return type==='sector'?(Number(sequence)===2?'#32c8e6':Number(sequence)===3?'#f2c94c':Number(sequence)===1?'#ff344c':'#a47cff'):type==='drs_zone'||type==='drs_detection'?'#70f2a8':type==='straight_mode_zone'||type==='straight_mode_activation'?'#ff3158':type==='straight_mode_low_grip_activation'?'#ff8a86':type==='overtake_detection'||type==='overtake_activation'?'#e738c5':type==='straight'?'#f2c94c':'#ff344c';}
function annotationLabel(type:AnnotationType,sequence:number|string|null,name:string|null){const title=name?.trim()??'';return type==='turn'&&sequence?`${sequence}${title?` · ${title}`:''}`:title||(type==='drs_zone'&&sequence?`DRS ${sequence}`:String(sequence??''));}
const empty={type:'FeatureCollection' as const,features:[]};
function isNumberOnlyTurn(annotation:AdminTrackAnnotation){return annotation.annotationType==='turn'&&annotation.sequence!==null&&!annotation.labelRu&&!annotation.labelOriginal;}
function featureCollection(annotations:AdminTrackAnnotation[]){return{type:'FeatureCollection' as const,features:annotations.filter(item=>!item.id.endsWith('-start-finish')).map(item=>({type:'Feature' as const,properties:{id:item.id,type:item.annotationType,sequence:item.sequence,label:annotationLabel(item.annotationType,item.sequence,item.labelRu??item.labelOriginal),hasCallout:Boolean(item.calloutPoint)},geometry:isNumberOnlyTurn(item)&&item.calloutPoint?{type:'Point' as const,coordinates:item.calloutPoint}:item.geometryGeoJson}))};}
function leaderStart(geometry:Geometry):number[]{return geometry.type==='Point'?geometry.coordinates:geometry.coordinates[Math.floor(geometry.coordinates.length/2)];}
function calloutFeature(labelPoint:number[],label:string,id?:string){return{type:'Feature' as const,properties:{label,id},geometry:{type:'Point' as const,coordinates:labelPoint}};}
function savedCallouts(annotations:AdminTrackAnnotation[]){return{type:'FeatureCollection' as const,features:annotations.flatMap(item=>item.calloutPoint&&!isNumberOnlyTurn(item)?[calloutFeature(item.calloutPoint,annotationLabel(item.annotationType,item.sequence,item.labelRu??item.labelOriginal),item.id)]:[])};}
type ScreenBox={left:number;top:number;right:number;bottom:number};
function labelBox(x:number,y:number,label:string,callout:boolean):ScreenBox{
  const measure=document.createElement('canvas').getContext('2d');if(measure)measure.font='12px Noto Sans, sans-serif';
  const width=Math.max(34,Math.min(340,(measure?.measureText(label).width??label.length*7.5)+16));
  return callout?{left:x+6,top:y-28,right:x+6+width,bottom:y-4}:{left:x-width/2,top:y+6,right:x+width/2,bottom:y+30};
}
function boxesOverlap(first:ScreenBox,second:ScreenBox){return first.left<second.right+8&&first.right+8>second.left&&first.top<second.bottom+6&&first.bottom+6>second.top;}
function distanceMeters(first:number[],second:number[]){
  const radians=Math.PI/180,deltaLat=(second[1]-first[1])*radians,deltaLon=(second[0]-first[0])*radians;
  const value=Math.sin(deltaLat/2)**2+Math.cos(first[1]*radians)*Math.cos(second[1]*radians)*Math.sin(deltaLon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(value)));
}
function distanceToAnnotationMeters(geometry:Geometry,point:number[]){return distanceMeters(geometry.type==='Point'?geometry.coordinates:nearestTrackPoint(geometry.coordinates,point).point,point);}
function findFreeCalloutPoint(map:MapLibreMap,geometry:Geometry,preferred:number[],label:string,annotations:AdminTrackAnnotation[],selectedId:string|undefined){
  const obstacles=annotations.filter(item=>item.id!==selectedId).map(item=>{
    const name=annotationLabel(item.annotationType,item.sequence,item.labelRu??item.labelOriginal);
    if(!name)return null;
    const location=item.calloutPoint??leaderStart(item.geometryGeoJson),screen=map.project(location as[number,number]);
    return labelBox(screen.x,screen.y,name,Boolean(item.calloutPoint));
  }).filter((box):box is ScreenBox=>box!==null);
  const origin=map.project(preferred as[number,number]),width=map.getCanvas().clientWidth,height=map.getCanvas().clientHeight;
  for(const radius of [0,18,32,48,64]){
    const steps=radius===0?1:16;
    for(let index=0;index<steps;index+=1){
      const angle=2*Math.PI*index/steps,x=origin.x+radius*Math.cos(angle),y=origin.y+radius*Math.sin(angle);
      const box=labelBox(x,y,label,true);
      if(box.left<12||box.top<12||box.right>width-12||box.bottom>height-12||obstacles.some(other=>boxesOverlap(box,other)))continue;
      const labelLayers=['annotation-turn-labels','annotation-point-labels','annotation-line-labels','annotation-callout-labels','legacy-turn-labels','legacy-named-labels','legacy-drs-labels','legacy-drs-zone-labels','legacy-start-finish','place-labels'].filter(id=>map.getLayer(id));
      if(labelLayers.length&&map.queryRenderedFeatures([[box.left,box.top],[box.right,box.bottom]],{layers:labelLayers}).length)continue;
      const candidate=map.unproject([x,y]);const point=[Number(candidate.lng.toFixed(7)),Number(candidate.lat.toFixed(7))];
      if(distanceToAnnotationMeters(geometry,point)<=950)return point;
    }
  }
  return null;
}
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
  const {map:sharedMap,activeTool,setActiveTool}=useUnifiedTrackAnnotationMap();
  const mapRef=useRef<MapLibreMap|null>(sharedMap),drawingRef=useRef(false),calloutModeRef=useRef(false),typeRef=useRef<AnnotationType>(selected?.annotationType??'turn');
  const draggingCalloutRef=useRef(false),draggingAnchorRef=useRef(false),dragPointRef=useRef<number[]|null>(null),dragStartPointRef=useRef<number[]|null>(null),restoreDragPanRef=useRef(false),suppressClickUntilRef=useRef(0);
  const draftRef=useRef<FeatureCollection>(empty),calloutDraftRef=useRef<FeatureCollection>(empty);
  const[type,setType]=useState<AnnotationType>(selected?.annotationType??'turn'),[coordinates,setCoordinates]=useState<number[][]>(()=>initialCoordinates(selected)),[alternate,setAlternate]=useState(false),[geometryEdited,setGeometryEdited]=useState(false),[calloutPoint,setCalloutPoint]=useState<number[]|null>(selected?.calloutPoint??null);
  const drawing=activeTool==='annotation:draw',calloutMode=activeTool==='annotation:callout';
  const coordinatesRef=useRef(coordinates);
  const[sequence,setSequence]=useState(selected?.sequence?.toString()??''),[labelRu,setLabelRu]=useState(selected?.labelRu??''),[labelOriginal,setLabelOriginal]=useState(selected?.labelOriginal??''),[placementMessage,setPlacementMessage]=useState('');
  const draftLabel=annotationLabel(type,sequence,labelRu||labelOriginal);
  const geometry=useMemo<Geometry|null>(()=>{
    if(selected&&!geometryEdited&&type===selected.annotationType)return selected.geometryGeoJson;
    if(pointTypes.has(type))return coordinates[0]?{type:'Point',coordinates:nearestTrackPoint(centerline.coordinates,coordinates[0]).point}:null;
    if(coordinates.length<2||samePoint(coordinates[0],coordinates[1]))return null;
    return {type:'LineString',coordinates:trackSlice(centerline.coordinates,coordinates,alternate)};
  },[alternate,centerline.coordinates,coordinates,geometryEdited,selected,type]);
  const geometryRef=useRef<Geometry|null>(geometry),draftLabelRef=useRef(draftLabel),calloutPointRef=useRef(calloutPoint);
  useEffect(()=>{mapRef.current=sharedMap;},[sharedMap]);
  useEffect(()=>{geometryRef.current=geometry;draftLabelRef.current=draftLabel;calloutPointRef.current=calloutPoint;},[geometry,draftLabel,calloutPoint]);
  const placeCallout=useCallback((preferred:number[])=>{
    const map=mapRef.current,currentGeometry=geometryRef.current;if(!map||!currentGeometry)return false;
    const free=findFreeCalloutPoint(map,currentGeometry,preferred,draftLabelRef.current||'Подпись',annotations,selected?.id);
    if(free){setCalloutPoint(free);setPlacementMessage('Подпись размещена без пересечения с другими подписями на текущем масштабе');return true;}
    setPlacementMessage('Свободного места рядом не найдено. Увеличьте карту и повторите размещение');return false;
  },[annotations,selected?.id]);
  useEffect(()=>{drawingRef.current=drawing;calloutModeRef.current=calloutMode;},[drawing,calloutMode]);
  useEffect(()=>{coordinatesRef.current=coordinates;},[coordinates]);
  useEffect(()=>{typeRef.current=type;},[type]);
  useEffect(()=>{const map=sharedMap;if(!map)return;mapRef.current=map;
      const otherAnnotations=annotations.filter(item=>item.id!==selected?.id);
      map.addSource('annotations',{type:'geojson',data:featureCollection(otherAnnotations)});map.addLayer({id:'annotation-lines',type:'line',source:'annotations',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','type'],'drs_zone']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['==',['get','type'],'sector'],['match',['get','sequence'],1,'#ff344c',2,'#32c8e6',3,'#f2c94c','#a47cff'],['match',['get','type'],'straight','#f2c94c','straight_mode_zone','#ff3158','#a47cff']],'line-width':['case',['==',['get','type'],'sector'],4.2,3],'line-opacity':.98}});
      map.addLayer({id:'annotation-drs-glow',type:'line',source:'annotations',filter:['==',['get','type'],'drs_zone'],layout:{'line-cap':'round'},paint:{'line-color':'#45e38b','line-width':13,'line-opacity':.22,'line-blur':5}});
      map.addLayer({id:'annotation-drs-lines',type:'line',source:'annotations',filter:['==',['get','type'],'drs_zone'],layout:{'line-cap':'round'},paint:{'line-color':'#70f2a8','line-width':2.1,'line-opacity':.92,'line-dasharray':[1.15,2.35]}});
      map.addSource('annotation-callouts',{type:'geojson',data:savedCallouts(otherAnnotations)});
      map.addLayer({id:'annotation-points',type:'circle',source:'annotations',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','type'],'turn']],paint:{'circle-color':['match',['get','type'],'timing_line','#32c8e6','drs_detection','#70f2a8','straight_mode_activation','#ff3158','straight_mode_low_grip_activation','#ff8a86','overtake_detection','#e738c5','overtake_activation','#e738c5','#fff'],'circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      map.addLayer({id:'annotation-turn-labels',type:'symbol',source:'annotations',filter:['all',['==',['geometry-type'],'Point'],['==',['get','type'],'turn']],layout:{'icon-image':'track-turn-badge','icon-allow-overlap':false,'icon-padding':4,'text-field':['to-string',['get','sequence']],'text-font':['Noto Sans Regular'],'text-size':9,'text-allow-overlap':false,'text-padding':5},paint:{'text-color':'#f6f9fa'}});
      map.addLayer({id:'annotation-point-labels',type:'symbol',source:'annotations',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','type'],'turn'],['!', ['get','hasCallout']]],layout:{'text-field':['to-string',['get','label']],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':['match',['get','id'],'be-1925-legacy-drs-detection-2',['literal',[0,2.8]],['literal',[0,1.4]]],'text-anchor':'top','text-allow-overlap':false},paint:{'text-color':['case',['==',['get','type'],'drs_detection'],'#9bff73','#fff'],'text-halo-color':'#07131b','text-halo-width':2}});
      map.addLayer({id:'annotation-line-labels',type:'symbol',source:'annotations',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','type'],'sector'],['!', ['get','hasCallout']]],layout:{'symbol-placement':'line','text-field':['to-string',['get','label']],'text-font':['Noto Sans Regular'],'text-size':12,'text-allow-overlap':false},paint:{'text-color':['case',['==',['get','type'],'drs_zone'],'#9bff73','#fff'],'text-halo-color':'#07131b','text-halo-width':2}});
      map.addLayer({id:'annotation-callout-labels',type:'symbol',source:'annotation-callouts',filter:['==',['geometry-type'],'Point'],layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[.5,-.5],'text-anchor':'bottom-left','text-allow-overlap':false},paint:{'text-color':'#fff','text-halo-color':'#07131b','text-halo-width':2}});
      map.addSource('annotation-draft',{type:'geojson',data:draftRef.current});map.addLayer({id:'draft-line',type:'line',source:'annotation-draft',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff3158','line-width':6}});map.addLayer({id:'draft-point',type:'circle',source:'annotation-draft',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','type'],'turn']],paint:{'circle-color':'#ff3158','circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}});
      map.addLayer({id:'draft-turn-label',type:'symbol',source:'annotation-draft',filter:['all',['==',['geometry-type'],'Point'],['==',['get','type'],'turn']],layout:{'icon-image':'track-turn-badge','icon-allow-overlap':true,'text-field':['to-string',['get','sequence']],'text-font':['Noto Sans Regular'],'text-size':9,'text-allow-overlap':true},paint:{'text-color':'#f6f9fa'}});
      map.addLayer({id:'draft-point-label',type:'symbol',source:'annotation-draft',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','type'],'turn'],['!', ['get','hasCallout']]],layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.4],'text-anchor':'top'},paint:{'text-color':['case',['==',['get','type'],'drs_detection'],'#9bff73','#fff'],'text-halo-color':'#07131b','text-halo-width':2}});
      map.addLayer({id:'draft-line-label',type:'symbol',source:'annotation-draft',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','type'],'sector'],['!', ['get','hasCallout']]],layout:{'symbol-placement':'line','text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':['case',['==',['get','type'],'drs_zone'],'#9bff73','#fff'],'text-halo-color':'#07131b','text-halo-width':2}});
      map.addSource('annotation-callout-draft',{type:'geojson',data:calloutDraftRef.current});
      map.addLayer({id:'draft-callout-point',type:'circle',source:'annotation-callout-draft',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#fff','circle-radius':10,'circle-stroke-color':'#ff3158','circle-stroke-width':2}});
      map.addLayer({id:'draft-callout-label',type:'symbol',source:'annotation-callout-draft',filter:['==',['geometry-type'],'Point'],layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[.5,-.5],'text-anchor':'bottom-left','text-allow-overlap':false},paint:{'text-color':'#fff','text-halo-color':'#07131b','text-halo-width':2}});
      if(map.getLayer('editor-start-finish'))map.moveLayer('editor-start-finish');
      map.setPaintProperty('draft-line','line-color',draftColor(typeRef.current));
      map.setPaintProperty('draft-point','circle-color',typeRef.current==='turn'?'#07131b':draftColor(typeRef.current));
      const beginDrag=(event:maplibregl.MapLayerMouseEvent|maplibregl.MapLayerTouchEvent)=>{if(activeTool==='annotation:move'||draggingCalloutRef.current||Date.now()<suppressClickUntilRef.current||!calloutPointRef.current||('touches' in event.originalEvent&&event.originalEvent.touches.length!==1))return;event.preventDefault();draggingCalloutRef.current=true;dragPointRef.current=calloutPointRef.current;dragStartPointRef.current=calloutPointRef.current;restoreDragPanRef.current=map.dragPan.isEnabled();map.dragPan.disable();map.getCanvas().style.cursor='grabbing';};
      map.on('mousedown','draft-callout-point',beginDrag);map.on('mousedown','draft-callout-label',beginDrag);map.on('mousedown','draft-turn-label',beginDrag);map.on('touchstart','draft-callout-point',beginDrag);map.on('touchstart','draft-callout-label',beginDrag);map.on('touchstart','draft-turn-label',beginDrag);
      const beginAnchorDrag=(event:maplibregl.MapLayerMouseEvent|maplibregl.MapLayerTouchEvent)=>{if(activeTool!=='annotation:move'||!selected||!pointTypes.has(typeRef.current)||('touches' in event.originalEvent&&event.originalEvent.touches.length!==1))return;event.preventDefault();draggingAnchorRef.current=true;restoreDragPanRef.current=map.dragPan.isEnabled();map.dragPan.disable();map.getCanvas().style.cursor='grabbing';};
      map.on('mousedown','draft-point',beginAnchorDrag);map.on('mousedown','draft-turn-label',beginAnchorDrag);map.on('touchstart','draft-point',beginAnchorDrag);map.on('touchstart','draft-turn-label',beginAnchorDrag);
    const moveDrag=(event:maplibregl.MapMouseEvent|maplibregl.MapTouchEvent)=>{if(draggingAnchorRef.current){const point=nearestTrackPoint(centerline.coordinates,[event.lngLat.lng,event.lngLat.lat]).point;coordinatesRef.current=[point];setCoordinates([point]);setGeometryEdited(true);return;}if(!draggingCalloutRef.current)return;const point=[event.lngLat.lng,event.lngLat.lat];if(geometryRef.current&&distanceToAnnotationMeters(geometryRef.current,point)<=950){dragPointRef.current=point.map(value=>Number(value.toFixed(7)));setCalloutPoint(dragPointRef.current);}};
    map.on('mousemove',moveDrag);map.on('touchmove',moveDrag);
    const finishDrag=()=>{if(!draggingCalloutRef.current&&!draggingAnchorRef.current)return;const wasCallout=draggingCalloutRef.current;draggingCalloutRef.current=false;draggingAnchorRef.current=false;if(restoreDragPanRef.current)map.dragPan.enable();map.getCanvas().style.cursor=drawingRef.current||calloutModeRef.current?'crosshair':'';suppressClickUntilRef.current=Date.now()+300;if(wasCallout&&dragPointRef.current&&!placeCallout(dragPointRef.current)&&dragStartPointRef.current)setCalloutPoint(dragStartPointRef.current);dragPointRef.current=null;dragStartPointRef.current=null;};
    map.on('mouseup',finishDrag);map.on('touchend',finishDrag);map.on('touchcancel',finishDrag);window.addEventListener('mouseup',finishDrag);window.addEventListener('touchend',finishDrag);window.addEventListener('touchcancel',finishDrag);
    const handleClick=(event:maplibregl.MapMouseEvent)=>{if(Date.now()<suppressClickUntilRef.current)return;const clicked=[event.lngLat.lng,event.lngLat.lat];if(activeTool==='annotation:move'&&selected&&pointTypes.has(typeRef.current)){const point=nearestTrackPoint(centerline.coordinates,clicked).point;coordinatesRef.current=[point];setCoordinates([point]);setGeometryEdited(true);setActiveTool(null);return;}if(calloutModeRef.current){if(placeCallout(clicked)){calloutModeRef.current=false;setActiveTool(null);}return;}if(!drawingRef.current)return;const point=nearestTrackPoint(centerline.coordinates,clicked).point;const next=pointTypes.has(typeRef.current)?[point]:coordinatesRef.current.length<2?[...coordinatesRef.current,point]:[point];coordinatesRef.current=next;setGeometryEdited(true);setAlternate(false);setCoordinates(next);if(pointTypes.has(typeRef.current)||next.length===2){drawingRef.current=false;setActiveTool(null);}};
    map.on('click',handleClick);
    return()=>{
      window.removeEventListener('mouseup',finishDrag);window.removeEventListener('touchend',finishDrag);window.removeEventListener('touchcancel',finishDrag);
      map.off('click',handleClick);map.off('mousemove',moveDrag);map.off('touchmove',moveDrag);map.off('mouseup',finishDrag);map.off('touchend',finishDrag);map.off('touchcancel',finishDrag);
      map.off('mousedown','draft-callout-point',beginDrag);map.off('mousedown','draft-callout-label',beginDrag);map.off('mousedown','draft-turn-label',beginDrag);map.off('touchstart','draft-callout-point',beginDrag);map.off('touchstart','draft-callout-label',beginDrag);map.off('touchstart','draft-turn-label',beginDrag);
      map.off('mousedown','draft-point',beginAnchorDrag);map.off('mousedown','draft-turn-label',beginAnchorDrag);map.off('touchstart','draft-point',beginAnchorDrag);map.off('touchstart','draft-turn-label',beginAnchorDrag);
      ['draft-callout-label','draft-callout-point','draft-line-label','draft-point-label','draft-turn-label','draft-point','draft-line','annotation-callout-labels','annotation-line-labels','annotation-point-labels','annotation-turn-labels','annotation-points','annotation-drs-lines','annotation-drs-glow','annotation-lines'].forEach(id=>{if(map.getLayer(id))map.removeLayer(id);});
      ['annotation-callout-draft','annotation-draft','annotation-callouts','annotations'].forEach(id=>{if(map.getSource(id))map.removeSource(id);});
      if(mapRef.current===map)mapRef.current=null;
    };},[activeTool,annotations,centerline.coordinates,placeCallout,selected,setActiveTool,sharedMap]);
  useEffect(()=>{const numberOnlyTurn=type==='turn'&&Boolean(sequence)&&!labelRu&&!labelOriginal;const displayGeometry=geometry&&numberOnlyTurn&&calloutPoint?{type:'Point' as const,coordinates:calloutPoint}:geometry;draftRef.current=displayGeometry?{type:'FeatureCollection',features:[{type:'Feature',properties:{type,sequence:sequence?Number(sequence):null,label:draftLabel,hasCallout:Boolean(calloutPoint)},geometry:displayGeometry}]}:empty;const source=sharedMap?.getSource('annotation-draft') as GeoJSONSource|undefined;source?.setData(draftRef.current);},[geometry,calloutPoint,draftLabel,labelOriginal,labelRu,sequence,sharedMap,type]);
  useEffect(()=>{const numberOnlyTurn=type==='turn'&&Boolean(sequence)&&!labelRu&&!labelOriginal;calloutDraftRef.current=geometry&&calloutPoint&&!numberOnlyTurn?{type:'FeatureCollection',features:[calloutFeature(calloutPoint,draftLabel||'Подпись')]}:empty;const source=sharedMap?.getSource('annotation-callout-draft') as GeoJSONSource|undefined;source?.setData(calloutDraftRef.current);},[geometry,calloutPoint,draftLabel,labelOriginal,labelRu,sequence,sharedMap,type]);
  useEffect(()=>{if(!sharedMap)return;const color=draftColor(type,sequence);if(sharedMap.getLayer('draft-line'))sharedMap.setPaintProperty('draft-line','line-color',color);if(sharedMap.getLayer('draft-point'))sharedMap.setPaintProperty('draft-point','circle-color',type==='turn'?'#07131b':color);},[sequence,type,sharedMap]);
  const nudgeCallout=(dx:number,dy:number)=>{const map=mapRef.current;if(!map||!calloutPoint)return;const position=map.project(calloutPoint as[number,number]),next=map.unproject([position.x+dx,position.y+dy]);placeCallout([next.lng,next.lat]);};
  const changeType=(next:AnnotationType)=>{if(next===type)return;setGeometryEdited(true);if(pointTypes.has(next)!==pointTypes.has(type))setCoordinates([]);setCalloutPoint(null);setPlacementMessage('');setActiveTool(null);setAlternate(false);setType(next);
    if(next.startsWith('straight_mode_')||next.startsWith('overtake_')){
      const form=document.getElementById('element-editor') as HTMLFormElement|null;
      const from=form?.elements.namedItem('validFromYear') as HTMLInputElement|null;
      const to=form?.elements.namedItem('validToYear') as HTMLInputElement|null;
      const year=Math.max(2026,Number(from?.value)||2026);
      if(from&&(!from.value||Number(from.value)<2026))from.value=String(year);
      if(to&&(!to.value||Number(to.value)<year))to.value=String(year);
    }
  };
  return <section className="admin-track-annotation-editor is-controls-only"><input type="hidden" name="geometryGeoJson" value={geometry?JSON.stringify(geometry):''}/><input type="hidden" name="calloutPointJson" value={calloutPoint?JSON.stringify(calloutPoint):''}/><aside>
    <div className="admin-track-digitizer-actions" role="group" aria-label="Быстрый выбор разметки"><button type="button" className={type==='turn'?'is-active':''} onClick={()=>changeType('turn')}>Номер поворота</button><button type="button" className={type==='straight'?'is-active':''} onClick={()=>changeType('straight')}>Название прямой</button><button type="button" className={type==='drs_zone'?'is-active':''} onClick={()=>changeType('drs_zone')}>Зона DRS</button><button type="button" className={type==='straight_mode_zone'?'is-active':''} onClick={()=>changeType('straight_mode_zone')}>Straight Mode</button><button type="button" className={type==='overtake_detection'?'is-active':''} onClick={()=>changeType('overtake_detection')}>Детекция Overtake</button></div>
    <label><span>Тип разметки</span><select name="annotationType" value={type} onChange={event=>changeType(event.target.value as AnnotationType)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>Номер {type==='turn'?'поворота':type==='drs_zone'?'зоны':'элемента'}</span><input name="sequence" type="number" min="1" max="999" value={sequence} onChange={event=>setSequence(event.target.value)}/></label>
    <label><span>Название на русском</span><input name="labelRu" value={labelRu} onChange={event=>setLabelRu(event.target.value)} onBlur={()=>{if(calloutPointRef.current)placeCallout(calloutPointRef.current);}} placeholder="Красная вода"/></label>
    <label><span>Оригинальное название</span><input name="labelOriginal" value={labelOriginal} onChange={event=>setLabelOriginal(event.target.value)} onBlur={()=>{if(calloutPointRef.current)placeCallout(calloutPointRef.current);}} placeholder="Eau Rouge"/></label>
    <p>{pointTypes.has(type)?'Нажмите рядом с контуром — точка автоматически прилипнет к оси трассы. Номер и название появятся на карте сразу':'Поставьте начало и конец — участок автоматически пройдёт по существующему контуру, без новой отрисовки'} После последней точки выбор завершится автоматически</p>
    <button type="button" className={drawing?'is-active':''} onClick={()=>setActiveTool(drawing?null:'annotation:draw')}>{drawing?'Прекратить выбор на контуре':'Выбрать на контуре'}</button>
    {selected&&pointTypes.has(type)?<button type="button" className={activeTool==='annotation:move'?'is-active':''} onClick={()=>setActiveTool(activeTool==='annotation:move'?null:'annotation:move')}>{activeTool==='annotation:move'?'Нажмите новое место на контуре':'Переместить точку на карте'}</button>:null}
    {(type==='turn'||type==='straight')&&geometry?<><button type="button" onClick={()=>{const map=mapRef.current;if(!map||!geometry)return;const anchor=map.project(leaderStart(geometry) as[number,number]);const location=map.unproject([anchor.x+24,anchor.y-28]);placeCallout([location.lng,location.lat]);}}>Разместить подпись автоматически</button><button type="button" className={calloutMode?'is-active':''} onClick={()=>setActiveTool(calloutMode?null:'annotation:callout')}>{calloutMode?'Нажмите место подписи на карте':'Поставить выносную подпись'}</button>{calloutPoint?<><div className="admin-track-callout-nudge" role="group" aria-label="Сдвинуть подпись"><button type="button" onClick={()=>nudgeCallout(-16,0)} aria-label="Сдвинуть подпись влево">←</button><button type="button" onClick={()=>nudgeCallout(0,-16)} aria-label="Сдвинуть подпись вверх">↑</button><button type="button" onClick={()=>nudgeCallout(0,16)} aria-label="Сдвинуть подпись вниз">↓</button><button type="button" onClick={()=>nudgeCallout(16,0)} aria-label="Сдвинуть подпись вправо">→</button></div><button type="button" onClick={()=>{setCalloutPoint(null);setActiveTool(null);setPlacementMessage('');}}>Убрать сноску</button></>:null}<p>Подпись можно перетащить за кружок или текст. Редактор подберёт свободное место рядом и сохранит связь с трассой</p>{placementMessage?<output role="status">{placementMessage}</output>:null}</>:null}
    <div className="admin-track-digitizer-actions"><button type="button" disabled={!coordinates.length} onClick={()=>{setGeometryEdited(true);setCoordinates(current=>current.slice(0,-1));}}>Отменить точку</button>{!pointTypes.has(type)&&coordinates.length===2&&samePoint(centerline.coordinates[0],centerline.coordinates.at(-1))?<button type="button" onClick={()=>{setGeometryEdited(true);setAlternate(value=>!value);}}>{alternate?'Основной участок':'Другой участок кольца'}</button>:null}<button type="button" disabled={!coordinates.length} onClick={()=>{setGeometryEdited(true);setCoordinates([]);}}>Очистить</button></div>
    <output>{coordinates.length} {coordinates.length===0?'опорных точек':coordinates.length===1?'опорная точка':'опорные точки'} · {geometry?'геометрия готова':'нужно продолжить'}</output>
  </aside></section>;
}
