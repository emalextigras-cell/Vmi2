import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFanEnergyEstimate, renderDailyEnergyClimateContext, renderWeeklyDiagnostic } from '../js/modules/energy-analysis-renderer.js';

function element(){return {className:'',textContent:'',innerHTML:''};}
const format=value=>Number(value).toFixed(1);
const formatShort=value=>new Date(value).toISOString();

test('estimation ventilateur : indique les données insuffisantes',()=>{
 const fan=element(),mode=element();
 renderFanEnergyEstimate([],{
  fanEnergyEstimate:fan,fanEnergyByMode:mode,
  summarizeFanEnergyEstimate:()=>({status:'insufficient',sampleCount:0,duplicateTimestampCount:0,conflictingTimestampCount:0}),
  summarizeFanEnergyByManualMode:()=>({hasManualModeData:false,duplicateTimestampCount:0,conflictingTimestampCount:0}),
  format,formatShort
 });
 assert.match(fan.textContent,/au moins deux relevés historiques/);
 assert.match(mode.textContent,/Pas de champ « Mode » manuel/);
});

test('rapprochement énergie/climat : explique les seuils non atteints',()=>{
 const box=element();
 renderDailyEnergyClimateContext([],{
  dailyEnergyClimateContext:box,
  summarizeDailyEnergyClimateContext:()=>({status:'insufficient',matchedDayCount:1,minFanHours:2,minClimateSamples:3,minDays:3,duplicateTimestampCount:0,conflictingTimestampCount:0}),
  format
 });
 assert.match(box.textContent,/Rapprochement encore insuffisant/);
 assert.match(box.textContent,/1 jour/);
});

test('diagnostic hebdomadaire : affiche un état explicite sans historique',()=>{
 const box=element();
 renderWeeklyDiagnostic([],{
  weeklyDiagnostic:box,
  summarizeWeeklyDiagnostic:()=>({status:'no-data',duplicateTimestampCount:0,conflictingTimestampCount:0}),
  format
 });
 assert.match(box.innerHTML,/Aucun historique horodaté exploitable/);
});

test('diagnostic hebdomadaire : détaille les fenêtres insuffisamment couvertes',()=>{
 const box=element();
 renderWeeklyDiagnostic([],{
  weeklyDiagnostic:box,
  summarizeWeeklyDiagnostic:()=>({
   status:'insufficient',minDaysPerWindow:4,windowDays:7,duplicateTimestampCount:0,conflictingTimestampCount:0,
   periods:[{id:'previous',start:'2026-01-01',end:'2026-01-07',dayCount:2,sampleCount:5},{id:'recent',start:'2026-01-08',end:'2026-01-14',dayCount:3,sampleCount:8}]
  }),
  format
 });
 assert.match(box.innerHTML,/Comparaison hebdomadaire non disponible/);
 assert.match(box.innerHTML,/2 \/ 4 jours exploitables/);
});
