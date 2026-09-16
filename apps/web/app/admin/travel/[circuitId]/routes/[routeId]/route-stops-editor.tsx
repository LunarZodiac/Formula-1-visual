'use client';
import { useState } from 'react';

type Stop={sequence:number;poiId:string|null;poiName:string|null;nameRu:string|null;dwellMinutes:number|null;instructionRu:string|null;longitude:number|null;latitude:number|null};
const emptyStop=(sequence:number):Stop=>({sequence,poiId:null,poiName:null,nameRu:'',dwellMinutes:null,instructionRu:'',longitude:null,latitude:null});

export function RouteStopsEditor({initialStops,pointOptions}:{initialStops:Stop[];pointOptions:Array<{id:string;name:string}>}){
 const[stops,setStops]=useState(initialStops);const update=(index:number,values:Partial<Stop>)=>setStops(current=>current.map((item,i)=>i===index?{...item,...values}:item));
 const move=(index:number,direction:-1|1)=>setStops(current=>{const next=[...current],target=index+direction;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next.map((item,i)=>({...item,sequence:i+1}));});
 const remove=(index:number)=>setStops(current=>current.filter((_,i)=>i!==index).map((item,i)=>({...item,sequence:i+1})));
 const payload=stops.map(stop=>({poiId:stop.poiId,nameRu:stop.nameRu,dwellMinutes:stop.dwellMinutes,instructionRu:stop.instructionRu,longitude:stop.longitude,latitude:stop.latitude}));
 return <fieldset><legend>Остановки маршрута</legend><input type="hidden" name="stopsJson" value={JSON.stringify(payload)}/>
  <p className="admin-field-note">Выберите точку из туристического слоя либо оставьте выбор пустым и задайте координаты самостоятельной остановки</p>
  <div className="admin-route-stops">{stops.map((stop,index)=><article key={`${stop.sequence}-${index}`} className="admin-route-stop">
   <header><strong>{String(index+1).padStart(2,'0')} · {stop.poiName||stop.nameRu||'Новая остановка'}</strong><div><button type="button" onClick={()=>move(index,-1)} disabled={index===0}>↑</button><button type="button" onClick={()=>move(index,1)} disabled={index===stops.length-1}>↓</button><button type="button" onClick={()=>remove(index)}>Удалить</button></div></header>
   <div className="admin-form-grid"><label className="is-wide"><span>Связанная туристическая точка</span><select value={stop.poiId??''} onChange={event=>{const option=pointOptions.find(item=>item.id===event.target.value);update(index,{poiId:event.target.value||null,poiName:option?.name??null});}}><option value="">Самостоятельная координатная остановка</option>{pointOptions.map(option=><option key={option.id} value={option.id}>{option.name} · {option.id}</option>)}</select></label>
    <label><span>Название в маршруте</span><input value={stop.nameRu??''} onChange={event=>update(index,{nameRu:event.target.value})}/></label><label><span>Время остановки, мин</span><input type="number" min="0" value={stop.dwellMinutes??''} onChange={event=>update(index,{dwellMinutes:event.target.value===''?null:Number(event.target.value)})}/></label>
    {!stop.poiId&&<><label><span>Долгота</span><input type="number" step="any" min="-180" max="180" value={stop.longitude??''} onChange={event=>update(index,{longitude:event.target.value===''?null:Number(event.target.value)})}/></label><label><span>Широта</span><input type="number" step="any" min="-90" max="90" value={stop.latitude??''} onChange={event=>update(index,{latitude:event.target.value===''?null:Number(event.target.value)})}/></label></>}
    <label className="is-wide"><span>Инструкция</span><textarea rows={2} value={stop.instructionRu??''} onChange={event=>update(index,{instructionRu:event.target.value})}/></label></div>
  </article>)}</div><button className="admin-row-action" type="button" onClick={()=>setStops(current=>[...current,emptyStop(current.length+1)])}>+ Добавить остановку</button>
 </fieldset>;
}
