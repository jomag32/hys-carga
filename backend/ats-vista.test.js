import test from "node:test"; import assert from "node:assert/strict";
test("lo que arma la vista F08 pasa las validaciones del backend", async () => {
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};globalThis.navigator={onLine:true};globalThis.window=globalThis;globalThis.location={search:"",hostname:"x"};
const v=(await import("../vistas/f08-ats-turno.js")).default;
const {leerCatalogoAts}=await import("../api/odoo.js");
const {validarAts}=await import("../backend/ats.js");
const cat=await leerCatalogoAts(); const ctx={cat};
const d={sector:"deposito",fecha:"2026-10-20",turno:cat.turnos[0],actividades:"Ejemplo",encargado_id:17,autoriza_id:18,fuera_rutina:"no",tareas:[],dotacion:3,charla:"si",resultado:"autorizado",firma_encargado:"data:image/png;base64,AA",firma_autoriza:"data:image/png;base64,AA",respuestas:{}};
for(const c of cat.controles.F08_DEP) d.respuestas[c.codigo]={respuesta:"si"};
const op=v.armar(d,{idempotency_key:"6f1c2a9e-1111-4222-8333-000000000001",fecha_hora_control:"2026-10-20T06:50:00-03:00",gps:{estado:"denegado"}},ctx);
const items=cat.controles.F08_DEP.map(c=>({x_codigo:c.codigo,x_name:c.nombre,x_critico:c.critico,x_admite_na:c.admite_na,x_secuencia:c.secuencia,x_formulario:"F08_DEP"}));
const turno={id:1,x_sector:"deposito",x_hora_inicio:7,x_dias:"0,1,2,3,4",x_codigo_ats:"ATS-DEP-001"};
const r=validarAts(op.cuerpo,{turno,items,minJustif:10,ahora:Date.parse("2026-10-20T10:00:00Z")});
assert.equal(op.endpoint, "/ats"); assert.deepEqual(r.errores, []);
});
