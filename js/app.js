/**
 * APLICACIÓN PRINCIPAL - LISTADO DE ESTUDIOS
 */
const App = (function() {
    'use strict';
    
    let db=[], logs=[], solicitudes=[], trash=[], onlineUsers={};
    let page=1, perPage=9999, filtered=[], editing=null, tempFiles={};
    let selected=new Set(), selectedArch=new Set(), selectedTrash=new Set();
    let maxId=414, currentEmailRecord=null, currentCompleteSol=null, completeFiles=[];
    let lastSyncTime=null, isSyncing=false, syncInterval=null;
    let currentTIRecord=null, tiFiles=[];
    
    // Utilidades
    const $=id=>document.getElementById(id);
    const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
    const formatDate=d=>{if(!d)return'—';try{return new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'});}catch{return d;}};
    const formatDateTime=d=>{if(!d)return'—';try{return new Date(d).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return d;}};
    const getDaysTo5Years=d=>{if(!d)return 9999;const d5=new Date(d);d5.setFullYear(d5.getFullYear()+5);return Math.ceil((d5-new Date())/86400000);};
    const get5YearDate=d=>{if(!d)return null;const dt=new Date(d);dt.setFullYear(dt.getFullYear()+5);return dt.toISOString().split('T')[0];};
    const getDaysRemaining=d=>{if(!d)return 9999;return Math.ceil((new Date(d)-new Date())/86400000);};
    const getUrgencyClass=d=>d<=5?'urgent':d<=30?'warning':'normal';
    
    function toast(msg,type='success'){const t=document.createElement('div');t.className=`toast toast-${type}`;t.innerHTML=`<span>${{success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'}[type]||'ℹ️'}</span><span>${msg}</span>`;$('toasts').appendChild(t);setTimeout(()=>t.remove(),3500);}
    function log(action,recordId,details){const user=Auth.get();logs.unshift({id:Date.now(),ts:new Date().toISOString(),user:user?.username||'Sistema',userName:user?.name||'Sistema',action,recordId,details});}
    function nextId(){maxId++;return maxId;}
    
    // Cloud Sync
    async function loadFromCloud(){
        try{
            const res=await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.main));
            if(!res.ok){if(res.status===400){if(typeof INITIAL_DATA!=='undefined'&&INITIAL_DATA.length>0)db=[...INITIAL_DATA];await saveToCloud(true);return true;}throw new Error();}
            const data=await res.json();
            if(data.registros&&data.registros.length>0){db=data.registros;solicitudes=data.solicitudes||[];logs=data.logs||[];trash=data.papelera||[];}
            else if(typeof INITIAL_DATA!=='undefined'&&INITIAL_DATA.length>0&&db.length===0)db=[...INITIAL_DATA];
            db.forEach(r=>{const m=String(r.id).match(/^(\d+)/);if(m){const n=parseInt(m[1]);if(n>maxId)maxId=n;}});
            lastSyncTime=new Date();updateSyncStatus();return true;
        }catch(e){console.error('Load:',e);if(typeof INITIAL_DATA!=='undefined'&&INITIAL_DATA.length>0&&db.length===0)db=[...INITIAL_DATA];updateSyncStatus(true);return false;}
    }
    
    async function saveToCloud(force=false){
        if(isSyncing&&!force)return false;
        isSyncing=true;showSyncIndicator(true);
        try{
            const user=Auth.get();
            const payload={registros:db,solicitudes,logs:logs.slice(0,2000),papelera:trash,lastUpdate:new Date().toISOString(),updatedBy:user?.username||'Sistema'};
            await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.main),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            lastSyncTime=new Date();updateSyncStatus();return true;
        }catch(e){console.error('Save:',e);updateSyncStatus(true);return false;}
        finally{isSyncing=false;showSyncIndicator(false);}
    }
    
    async function updateOnlineStatus(){
        const user=Auth.get();if(!user)return;
        try{
            let online={};
            try{const res=await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.online));if(res.ok)online=await res.json();}catch{}
            const sid=Auth.getSid();
            online[sid]={username:user.username,name:user.name,lastSeen:Date.now(),isTI:user.isTI};
            Object.keys(online).forEach(id=>{if(Date.now()-(online[id]?.lastSeen||0)>CONFIG.app.sessionTimeout)delete online[id];});
            onlineUsers=online;
            await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.online),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(online)});
            renderOnlineUsers();
        }catch(e){}
    }
    
    function startSync(){if(syncInterval)clearInterval(syncInterval);syncInterval=setInterval(async()=>{if(!Auth.isAuth())return;await loadFromCloud();await updateOnlineStatus();if(!$('modalOverlay').classList.contains('active')&&!$('tiModalOverlay').classList.contains('active'))applyFilters();updateStats();},CONFIG.app.syncInterval);}
    function stopSync(){if(syncInterval){clearInterval(syncInterval);syncInterval=null;}}
    function showSyncIndicator(show){$('syncIndicator').classList.toggle('active',show);}
    function updateSyncStatus(error=false){const el=$('cloudStatus');if(error){el.classList.add('offline');el.innerHTML='<div class="dot"></div><span>Error</span>';}else{el.classList.remove('offline','syncing');el.innerHTML='<div class="dot"></div><span>Conectado</span>';if(lastSyncTime)$('lastSyncText').textContent=lastSyncTime.toLocaleTimeString('es-MX');}}
    function renderOnlineUsers(){const c=$('onlineAvatars');const unique=[...new Map(Object.values(onlineUsers).filter(u=>u&&Date.now()-(u.lastSeen||0)<CONFIG.app.sessionTimeout).map(u=>[u.username,u])).values()];if(c)c.innerHTML=unique.slice(0,5).map(u=>`<div class="online-avatar ${u.isTI?'admin':''}" title="${u.name}">${u.name?.charAt(0)||'?'}</div>`).join('');$('onlineCount').textContent=unique.length;$('syncOnlineCount').textContent=unique.length;$('loginOnlineCount').textContent=unique.length;}
    
    async function forceSync(){
        const status=$('cloudStatus');
        status.classList.add('syncing');status.innerHTML='<div class="dot"></div><span>Sync...</span>';
        await saveToCloud();await loadFromCloud();await updateOnlineStatus();
        const user=Auth.get();
        applyFilters();renderAll();log('SYNC',null,`Sync - ${user?.name}`);
        toast('✅ Sincronizado','success');
    }
    
    // UI Updates
    function updateUI(){
        const user=Auth.get();if(!user)return;
        $('userName').textContent=user.name;
        $('userRole').textContent=user.role;
        const avatar=$('userAvatar');
        avatar.textContent=user.name.charAt(0);
        avatar.classList.toggle('admin',user.isTI);
        // Actualizar documento header desde config
        $('docTitulo').textContent=CONFIG.documento.titulo;
        $('docCodigo').textContent=CONFIG.documento.codigo;
        $('docVersion').textContent='Versión '+CONFIG.documento.version;
    }
    
    function switchTab(tab){
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        document.querySelector(`[onclick="App.switchTab('${tab}')"]`).classList.add('active');
        $(`tab${cap(tab)}`).classList.add('active');
        if(tab==='solicitudes')renderSolicitudes();
        if(tab==='destruccion')renderDestruction();
        if(tab==='papelera')renderTrash();
        if(tab==='logs')renderLogs();
    }
    
    // Forms
    function openModal(idx=null){
        editing=idx;tempFiles={};
        $('modalOverlay').classList.add('active');
        $('modalTitle').innerHTML=idx!==null?'✏️ Editar':'📝 Nuevo';
        $('prevEstatus').innerHTML='';
        if(idx!==null){populateForm(db[idx]);}
        else{$('recordForm').reset();$('fId').value=nextId();CONFIG.areas.forEach(a=>$(`inc${cap(a)}`).classList.remove('active'));}
    }
    function closeModal(){$('modalOverlay').classList.remove('active');editing=null;}
    
    function populateForm(r){
        $('fId').value=r.id;$('fNombre').value=r.nombreProyecto||'';$('fCodProy').value=r.codigoProyecto||'';$('fCodVal').value=r.codigoValidacion||'';$('fPatrocinador').value=r.patrocinador||'';$('fRojo').checked=r.patrocinadorRojo||false;$('fEquipo').value=r.equipo||'';
        CONFIG.areas.forEach(a=>{const d=r.areas?.[a]||{};$(`a${cap(a)}`).value=d.estado||'';$(`falta${cap(a)}`).value=d.falta||'';$(`inc${cap(a)}`).classList.toggle('active',d.estado==='Incompleta');});
        $('fEstatus').value=r.estatus||'';$('fUrlEstatus').value=r.urlEstatus||'';if(r.archivosEstatus?.length){tempFiles['estatus']=r.archivosEstatus;showFiles('estatus',r.archivosEstatus);}
        $('fInforme').value=r.fechas?.informe||'';$('fDestruccion').value=r.fechas?.destruccion||'';$('fSolicitudTI').value=r.fechas?.solicitudTI||'';
        $('fIdSec').value=r.idSecundario||'';$('fUbicacion').value=r.ubicacion||'';$('fResguardo').value=r.resguardo||'';$('fObservaciones').value=r.observaciones||'';
    }
    
    function toggleInc(a){$(`inc${cap(a)}`).classList.toggle('active',$(`a${cap(a)}`).value==='Incompleta');}
    
    function previewFiles(area){const input=$('fileEstatus');tempFiles[area]=tempFiles[area]||[];Array.from(input.files).forEach(f=>{const reader=new FileReader();reader.onload=e=>{tempFiles[area].push({name:f.name,type:f.type,data:e.target.result});showFiles(area,tempFiles[area]);};reader.readAsDataURL(f);});}
    function showFiles(area,files){const c=$(`prev${cap(area)}`);if(!c)return;c.innerHTML=files.map((f,i)=>`<div class="file-item">${f.type?.startsWith('image/')?`<img src="${f.data}" onclick="App.showImg('${f.data}')">`:'<span style="font-size:0.9rem">📄</span>'}<span class="name">${f.name}</span><button type="button" class="remove" onclick="App.removeFile('${area}',${i})">×</button></div>`).join('');}
    function removeFile(area,i){if(tempFiles[area]){tempFiles[area].splice(i,1);showFiles(area,tempFiles[area]);}}
    function showImg(src){$('imgView').src=src;$('imgModal').classList.add('active');}
    function closeImg(){$('imgModal').classList.remove('active');}
    
    async function saveRecord(e){
        e.preventDefault();const isNew=editing===null;const user=Auth.get();
        const rec={id:String($('fId').value),nombreProyecto:$('fNombre').value.trim(),codigoProyecto:$('fCodProy').value.trim(),codigoValidacion:$('fCodVal').value.trim(),patrocinador:$('fPatrocinador').value.trim(),patrocinadorRojo:$('fRojo').checked,equipo:$('fEquipo').value.trim(),areas:{},estatus:$('fEstatus').value.trim(),urlEstatus:$('fUrlEstatus').value.trim(),archivosEstatus:tempFiles['estatus']||[],fechas:{informe:$('fInforme').value,destruccion:$('fDestruccion').value,solicitudTI:$('fSolicitudTI').value},idSecundario:$('fIdSec').value.trim(),ubicacion:$('fUbicacion').value,resguardo:$('fResguardo').value,observaciones:$('fObservaciones').value.trim(),observacionesTI:isNew?'':(db[editing]?.observacionesTI||''),urlTI:isNew?'':(db[editing]?.urlTI||''),archivosTI:isNew?[]:(db[editing]?.archivosTI||[]),archivado:false,solicitudes:isNew?[]:(db[editing]?.solicitudes||[]),registroCompleto:isNew?false:(db[editing]?.registroCompleto||false),createdAt:isNew?new Date().toISOString():(db[editing]?.createdAt||new Date().toISOString()),updatedAt:new Date().toISOString(),updatedBy:user?.username};
        CONFIG.areas.forEach(a=>{rec.areas[a]={estado:$(`a${cap(a)}`).value,falta:$(`falta${cap(a)}`).value.trim()};});
        if(!rec.nombreProyecto||!rec.codigoProyecto||!rec.patrocinador||!rec.ubicacion||!rec.resguardo){toast('Complete campos','error');return;}
        if(isNew){db.unshift(rec);log('CREATE',rec.id,`Nuevo: ${rec.nombreProyecto} - ${user?.name}`);toast('Creado');}else{db[editing]=rec;log('UPDATE',rec.id,`Editado: ${rec.nombreProyecto} - ${user?.name}`);toast('Actualizado');}
        await saveToCloud();applyFilters();updateStats();renderDestruction();closeModal();
    }
    
    // TI Modal
    function openTIModal(idx){
        if(!Auth.isTI()){toast('Solo Admin TI puede editar','error');return;}
        currentTIRecord=db[idx];
        tiFiles=currentTIRecord.archivosTI?[...currentTIRecord.archivosTI]:[];
        $('tiCaja').value=currentTIRecord.id;
        $('tiProyecto').value=currentTIRecord.nombreProyecto;
        $('tiObservaciones').value=currentTIRecord.observacionesTI||'';
        $('tiUrl').value=currentTIRecord.urlTI||'';
        $('tiFiles').value='';
        showTIFiles();
        $('tiModalOverlay').classList.add('active');
    }
    function closeTIModal(){$('tiModalOverlay').classList.remove('active');currentTIRecord=null;tiFiles=[];}
    function previewTIFiles(){const input=$('tiFiles');Array.from(input.files).forEach(f=>{const reader=new FileReader();reader.onload=e=>{tiFiles.push({name:f.name,type:f.type,data:e.target.result});showTIFiles();};reader.readAsDataURL(f);});}
    function showTIFiles(){$('prevTIFiles').innerHTML=tiFiles.map((f,i)=>`<div class="file-item">${f.type?.startsWith('image/')?`<img src="${f.data}" onclick="App.showImg('${f.data}')">`:'<span style="font-size:0.9rem">📄</span>'}<span class="name">${f.name}</span><button type="button" class="remove" onclick="App.removeTIFile(${i})">×</button></div>`).join('');}
    function removeTIFile(i){tiFiles.splice(i,1);showTIFiles();}
    async function saveTIObservaciones(){
        if(!currentTIRecord||!Auth.isTI())return;
        const idx=db.findIndex(r=>r.id===currentTIRecord.id);if(idx<0)return;
        const user=Auth.get();
        db[idx].observacionesTI=$('tiObservaciones').value.trim();
        db[idx].urlTI=$('tiUrl').value.trim();
        db[idx].archivosTI=tiFiles;
        db[idx].tiUpdatedAt=new Date().toISOString();
        db[idx].tiUpdatedBy=user?.username;
        log('TI_UPDATE',db[idx].id,`Obs.TI: ${db[idx].nombreProyecto} - ${user?.name}`);
        await saveToCloud();closeTIModal();applyFilters();toast('✅ Observaciones TI guardadas','success');
    }
    
    // Delete/Archive
    async function deleteRecord(idx){const user=Auth.get();const r=db[idx];if(confirm(`¿Eliminar #${r.id}?`)){r.deletedAt=new Date().toISOString();r.deletedBy=user?.username;trash.unshift(r);log('DELETE',r.id,`Eliminado: ${r.nombreProyecto} - ${user?.name}`);db.splice(idx,1);await saveToCloud();applyFilters();updateStats();renderTrash();toast('A papelera','warning');}}
    
    function viewDetail(idx){
        const r=db[idx];let h='';if(r.urlEstatus)h+=`<p><a href="${r.urlEstatus}" target="_blank" style="color:var(--primary)">🔗 ${r.urlEstatus}</a></p>`;
        if(r.archivosEstatus?.length){h+='<div style="display:flex;flex-wrap:wrap;gap:0.18rem;margin-top:0.18rem">'+r.archivosEstatus.map(f=>f.type?.startsWith('image/')?`<img src="${f.data}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="App.showImg('${f.data}')">`:`<div style="padding:0.18rem;background:var(--bg-main);border-radius:3px;font-size:0.52rem">📄 ${f.name}</div>`).join('')+'</div>';}
        let tiH='';if(r.urlTI)tiH+=`<p><a href="${r.urlTI}" target="_blank" style="color:var(--ti-color)">🔗 ${r.urlTI}</a></p>`;
        if(r.archivosTI?.length){tiH+='<div style="display:flex;flex-wrap:wrap;gap:0.18rem;margin-top:0.18rem">'+r.archivosTI.map(f=>f.type?.startsWith('image/')?`<img src="${f.data}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--ti-color)" onclick="App.showImg('${f.data}')">`:`<div style="padding:0.18rem;background:rgba(8,145,178,0.1);border-radius:3px;font-size:0.52rem;color:var(--ti-color)">📄 ${f.name}</div>`).join('')+'</div>';}
        $('detailContent').innerHTML=`<div class="form-section"><div class="form-section-title">📋 Caja #${r.id}</div><p><strong>Proyecto:</strong> ${r.nombreProyecto}</p><p><strong>Código:</strong> ${r.codigoProyecto}</p><p><strong>Patrocinador:</strong> ${r.patrocinador}</p></div><div class="form-section"><div class="form-section-title">📅 Fechas</div><p><strong>Informe:</strong> ${formatDate(r.fechas?.informe)}</p><p><strong>Destrucción:</strong> ${formatDate(r.fechas?.destruccion)}</p><p><strong>Solicitud TI:</strong> ${formatDate(r.fechas?.solicitudTI)}</p><p><strong>5 años:</strong> ${formatDate(get5YearDate(r.fechas?.informe))}</p></div><div class="form-section section-estatus"><div class="form-section-title">📝 Estatus</div><p>${r.estatus||'Sin estatus'}</p>${h}</div>${r.observaciones?`<div class="form-section section-obs"><div class="form-section-title">💬 Observaciones</div><p>${r.observaciones}</p></div>`:''}${r.observacionesTI||r.urlTI||r.archivosTI?.length?`<div class="form-section section-ti"><div class="form-section-title ti-title">🖥️ Observaciones TI</div><p style="color:var(--ti-color)">${r.observacionesTI||'Sin observaciones TI'}</p>${tiH}${r.tiUpdatedBy?`<p style="font-size:0.5rem;color:var(--text-muted);margin-top:0.3rem">Por: ${r.tiUpdatedBy} - ${formatDateTime(r.tiUpdatedAt)}</p>`:''}</div>`:''}`;
        $('detailTitle').textContent='📋 Caja #'+r.id;$('detailModal').classList.add('active');
    }
    function closeDetail(){$('detailModal').classList.remove('active');}
    
    // Email
    function openEmailModal(idx){const user=Auth.get();currentEmailRecord=db[idx];const r=currentEmailRecord;const fl=new Date();fl.setDate(fl.getDate()+CONFIG.alertas.solicitud);$('emailCaja').value=r.id;$('emailProyecto').value=r.nombreProyecto;$('emailCodigo').value=r.codigoProyecto;$('emailPatrocinador').value=r.patrocinador;$('emailFechaLimite').value=fl.toLocaleDateString('es-MX');$('emailTo').value='';$('emailSubject').value=`Solicitud - Caja #${r.id} - ${r.nombreProyecto}`;$('emailBody').value=`Solicitud:\n\nCaja: #${r.id}\nProyecto: ${r.nombreProyecto}\nCódigo: ${r.codigoProyecto}\n\nFECHA LÍMITE: ${fl.toLocaleDateString('es-MX')}\n\nSaludos,\n${user?.name}`;$('emailModalOverlay').classList.add('active');}
    function closeEmailModal(){$('emailModalOverlay').classList.remove('active');currentEmailRecord=null;}
    async function sendEmail(){const to=$('emailTo').value.trim();if(!to||!to.includes('@')){toast('Correo inválido','error');return;}const user=Auth.get();const fl=new Date();fl.setDate(fl.getDate()+CONFIG.alertas.solicitud);const r=currentEmailRecord;const sol={id:Date.now(),recordId:r.id,proyecto:r.nombreProyecto,codigo:r.codigoProyecto,destinatario:to,fechaEnvio:new Date().toISOString(),fechaLimite:fl.toISOString(),estado:'pendiente',enviadoPor:user?.username};solicitudes.push(sol);if(!r.solicitudes)r.solicitudes=[];r.solicitudes.push(sol);log('EMAIL',r.id,`Correo a: ${to} - ${user?.name}`);await saveToCloud();window.open(`mailto:${to}?subject=${encodeURIComponent($('emailSubject').value)}&body=${encodeURIComponent($('emailBody').value)}`,'_blank');closeEmailModal();render();renderSolicitudes();updateStats();toast('Solicitud enviada');}
    
    // Complete
    function openCompleteModal(solId){const sol=solicitudes.find(s=>s.id===solId);if(!sol)return;currentCompleteSol=sol;completeFiles=[];$('completeCaja').value=sol.recordId;$('completeProyecto').value=sol.proyecto;$('completeFiles').value='';$('prevCompleteFiles').innerHTML='';$('completeUrl').value='';$('completeNotas').value='';$('completeModalOverlay').classList.add('active');}
    function closeCompleteModal(){$('completeModalOverlay').classList.remove('active');currentCompleteSol=null;completeFiles=[];}
    function previewCompleteFiles(){const input=$('completeFiles');completeFiles=[];Array.from(input.files).forEach(f=>{const reader=new FileReader();reader.onload=e=>{completeFiles.push({name:f.name,type:f.type,data:e.target.result});showCompleteFiles();};reader.readAsDataURL(f);});}
    function showCompleteFiles(){$('prevCompleteFiles').innerHTML=completeFiles.map(f=>`<div class="file-item">${f.type?.startsWith('image/')?`<img src="${f.data}" onclick="App.showImg('${f.data}')">`:'<span style="font-size:0.9rem">📄</span>'}<span class="name">${f.name}</span></div>`).join('');}
    async function confirmComplete(){if(!currentCompleteSol)return;const user=Auth.get();const sol=solicitudes.find(s=>s.id===currentCompleteSol.id);if(!sol)return;sol.estado='completada';sol.fechaCompletada=new Date().toISOString();sol.respuesta={archivos:completeFiles,url:$('completeUrl').value.trim(),notas:$('completeNotas').value.trim(),completadoPor:user?.username};const rec=db.find(r=>r.id==sol.recordId);if(rec){if(!rec.archivosEstatus)rec.archivosEstatus=[];if(completeFiles.length)rec.archivosEstatus=[...rec.archivosEstatus,...completeFiles];const newUrl=$('completeUrl').value.trim();if(newUrl)rec.urlEstatus=newUrl;const notas=$('completeNotas').value.trim();if(notas)rec.estatus=rec.estatus?rec.estatus+'\n['+new Date().toLocaleDateString('es-MX')+'] '+notas:notas;rec.registroCompleto=true;log('COMPLETE',sol.recordId,`Entregado: ${sol.proyecto} - ${user?.name}`);}await saveToCloud();closeCompleteModal();render();renderSolicitudes();updateStats();toast('✅ Entregado');}
    
    // Selection
    function toggleSelectAll(){const c=$('selectAll').checked;selected.clear();if(c)filtered.forEach(r=>selected.add(r.id));render();$('btnArchive').disabled=selected.size===0;}
    function toggleSel(id){if(selected.has(id))selected.delete(id);else selected.add(id);$('btnArchive').disabled=selected.size===0;}
    async function archiveSelected(){if(!selected.size)return;const user=Auth.get();if(confirm(`¿Archivar ${selected.size}?`)){selected.forEach(id=>{const r=db.find(x=>x.id==id);if(r){r.archivado=true;r.fechaArchivado=new Date().toISOString();r.archivadoPor=user?.username;}});log('ARCHIVE',null,`${selected.size} archivados - ${user?.name}`);selected.clear();await saveToCloud();applyFilters();renderArchived();updateStats();toast('Archivados');}}
    async function archiveSingle(idx){const user=Auth.get();const r=db[idx];if(confirm(`¿Archivar #${r.id}?`)){r.archivado=true;r.fechaArchivado=new Date().toISOString();r.archivadoPor=user?.username;log('ARCHIVE',r.id,`Archivado - ${user?.name}`);await saveToCloud();applyFilters();renderArchived();updateStats();toast('Archivado');}}
    
    // Archive management
    function toggleSelectAllArchived(){const c=$('selectAllArchived').checked;selectedArch.clear();if(c)db.filter(r=>r.archivado).forEach(r=>selectedArch.add(r.id));renderArchived();$('btnRestore').disabled=selectedArch.size===0;}
    function toggleSelArch(id){if(selectedArch.has(id))selectedArch.delete(id);else selectedArch.add(id);$('btnRestore').disabled=selectedArch.size===0;}
    async function restoreSelected(){if(!selectedArch.size)return;const user=Auth.get();selectedArch.forEach(id=>{const r=db.find(x=>x.id==id);if(r)r.archivado=false;});log('RESTORE',null,`${selectedArch.size} restaurados - ${user?.name}`);selectedArch.clear();await saveToCloud();applyFilters();renderArchived();updateStats();toast('Restaurados');}
    async function restoreSingle(id){const user=Auth.get();const r=db.find(x=>x.id==id);if(r){r.archivado=false;log('RESTORE',r.id,`Restaurado - ${user?.name}`);await saveToCloud();applyFilters();renderArchived();updateStats();toast('Restaurado');}}
    
    // Trash management
    function toggleSelectAllTrash(){const c=$('selectAllTrash').checked;selectedTrash.clear();if(c)trash.forEach(r=>selectedTrash.add(r.id));renderTrash();$('btnRestoreTrash').disabled=selectedTrash.size===0;}
    function toggleSelTrash(id){if(selectedTrash.has(id))selectedTrash.delete(id);else selectedTrash.add(id);$('btnRestoreTrash').disabled=selectedTrash.size===0;}
    async function restoreFromTrash(){if(!selectedTrash.size)return;const user=Auth.get();selectedTrash.forEach(id=>{const idx=trash.findIndex(x=>x.id==id);if(idx>=0){const r=trash[idx];delete r.deletedAt;delete r.deletedBy;db.unshift(r);trash.splice(idx,1);}});log('RESTORE',null,`${selectedTrash.size} de papelera - ${user?.name}`);selectedTrash.clear();await saveToCloud();applyFilters();renderTrash();updateStats();toast('Restaurados');}
    async function restoreSingleTrash(id){const user=Auth.get();const idx=trash.findIndex(x=>x.id==id);if(idx>=0){const r=trash[idx];delete r.deletedAt;delete r.deletedBy;db.unshift(r);trash.splice(idx,1);log('RESTORE',r.id,`De papelera - ${user?.name}`);await saveToCloud();applyFilters();renderTrash();updateStats();toast('Restaurado');}}
    async function deletePermanent(id){if(confirm('¿Eliminar PERMANENTEMENTE?')){const user=Auth.get();const idx=trash.findIndex(x=>x.id==id);if(idx>=0){log('DELETE',id,`Permanente - ${user?.name}`);trash.splice(idx,1);await saveToCloud();renderTrash();updateStats();toast('Eliminado','warning');}}}
    async function emptyTrash(){if(!trash.length)return;if(confirm(`¿Vaciar (${trash.length})?`)){const user=Auth.get();log('DELETE',null,`Vaciada: ${trash.length} - ${user?.name}`);trash=[];await saveToCloud();renderTrash();updateStats();toast('Vaciada','warning');}}
    function filterTrash(){renderTrash($('trashSearch')?.value?.toLowerCase()||'');}
    function filterArchived(){renderArchived($('archiveSearch')?.value?.toLowerCase()||'');}
    
    // Filters and render
    function applyFilters(){
        const gs=$('globalSearch')?.value?.toLowerCase()||'';const filters={};
        document.querySelectorAll('#tabRegistros .filter-input').forEach(i=>{if(i.dataset.filter&&i.value)filters[i.dataset.filter]=i.value.toLowerCase();});
        filtered=db.filter(r=>{if(r.archivado)return false;if(gs&&!JSON.stringify(r).toLowerCase().includes(gs))return false;for(const[k,v]of Object.entries(filters)){if(!String(r[k]||'').toLowerCase().includes(v))return false;}return true;});
        filtered.sort((a,b)=>{const aM=String(a.id).match(/^(\d+)/);const bM=String(b.id).match(/^(\d+)/);return(bM?parseInt(bM[1]):0)-(aM?parseInt(aM[1]):0);});
        page=1;render();
    }
    
    function render(){
        const tbody=$('tableBody');const start=(page-1)*perPage;const data=filtered.slice(start,start+perPage);
        if(!data.length){tbody.innerHTML='<tr><td colspan="22"><div class="empty-state"><div class="icon">📭</div><h3>Sin registros</h3></div></td></tr>';}
        else{
            tbody.innerHTML=data.map(r=>{
                const idx=db.indexOf(r);
                let eh='';if(r.estatus)eh+=`<div class="estatus-text">${r.estatus}</div>`;
                eh+='<div class="estatus-links">';if(r.urlEstatus)eh+=`<a href="${r.urlEstatus}" target="_blank" class="estatus-link">🔗</a>`;
                if(r.archivosEstatus?.length){r.archivosEstatus.slice(0,2).forEach(f=>{if(f.type?.startsWith('image/'))eh+=`<img src="${f.data}" class="estatus-thumb" onclick="App.showImg('${f.data}')">`});if(r.archivosEstatus.length>2)eh+=`<span class="estatus-link">+${r.archivosEstatus.length-2}</span>`;}
                eh+='</div>';
                let tih='';if(r.observacionesTI)tih+=`<div class="ti-text">${r.observacionesTI}</div>`;
                tih+='<div class="ti-links">';if(r.urlTI)tih+=`<a href="${r.urlTI}" target="_blank" class="ti-link">🔗</a>`;
                if(r.archivosTI?.length){r.archivosTI.slice(0,2).forEach(f=>{if(f.type?.startsWith('image/'))tih+=`<img src="${f.data}" class="ti-thumb" onclick="App.showImg('${f.data}')">`});if(r.archivosTI.length>2)tih+=`<span class="ti-link">+${r.archivosTI.length-2}</span>`;}
                tih+='</div>';
                const d5=getDaysTo5Years(r.fechas?.informe);let d5h='—';
                if(r.fechas?.informe){if(d5<=0)d5h='<span class="destruct-badge urgent">⚠️VENC</span>';else if(d5<=CONFIG.alertas.destruccion)d5h=`<span class="destruct-badge urgent">🔥${d5}d</span>`;else if(d5<=CONFIG.alertas.warning)d5h=`<span class="destruct-badge warning">⚠️${d5}d</span>`;else d5h=`<span class="destruct-badge ok">✓${Math.floor(d5/365)}a</span>`;}
                return`<tr class="${r.patrocinadorRojo?'highlight-red':''} ${selected.has(r.id)?'selected':''} ${d5<=CONFIG.alertas.destruccion&&d5>0?'destruct-warning':''}"><td class="cell-checkbox"><input type="checkbox" ${selected.has(r.id)?'checked':''} onchange="App.toggleSel('${r.id}')"></td><td class="cell-id">${r.id}</td><td>${r.nombreProyecto}</td><td><span class="cell-code">${r.codigoProyecto}</span></td><td>${r.codigoValidacion||'—'}</td><td>${r.patrocinador}</td><td>${r.equipo||'—'}</td><td>${renderSt(r.areas?.analitica)}</td><td>${renderSt(r.areas?.calidad)}</td><td>${renderSt(r.areas?.clinica)}</td><td>${renderSt(r.areas?.estadistico)}</td><td class="estatus-cell"><div class="estatus-content">${eh||'—'}</div></td><td class="cell-date">${formatDate(r.fechas?.informe)}</td><td class="cell-date">${formatDate(r.fechas?.destruccion)}</td><td class="cell-date">${formatDate(r.fechas?.solicitudTI)}</td><td>${d5h}</td><td class="obs-cell"><div class="obs-text">${r.observaciones||'—'}</div></td><td class="ti-cell"><div class="ti-content">${tih||'—'}</div></td><td>${r.idSecundario||'—'}</td><td>${r.ubicacion||'—'}</td><td>${r.resguardo||'—'}</td><td><div class="action-btns"><button class="btn-view" onclick="App.viewDetail(${idx})">👁</button><button class="btn-edit" onclick="App.openModal(${idx})">✏️</button><button class="btn-ti-edit" onclick="App.openTIModal(${idx})" title="Obs. TI">🖥️</button><button class="btn-mail" onclick="App.openEmailModal(${idx})">📧</button><button class="btn-archive" onclick="App.archiveSingle(${idx})">📦</button><button class="btn-delete" onclick="App.deleteRecord(${idx})">🗑️</button></div></td></tr>`;
            }).join('');
        }
        const total=Math.ceil(filtered.length/perPage)||1;$('pageInfo').textContent=`${page}/${total} (${filtered.length})`;$('prevBtn').disabled=page===1;$('nextBtn').disabled=page===total;$('badgeActive').textContent=filtered.length;
    }
    
    function renderSt(a){if(!a?.estado)return'—';const cls=a.estado==='Completa'?'status-completa':a.estado==='Incompleta'?'status-incompleta':'status-x';return`<span class="status-badge ${cls}">${a.estado==='Completa'?'✓':a.estado==='Incompleta'?'✗':'X'}</span>`;}
    
    function renderArchived(search=''){const arch=db.filter(r=>r.archivado&&(!search||JSON.stringify(r).toLowerCase().includes(search))).sort((a,b)=>{const aM=String(a.id).match(/^(\d+)/);const bM=String(b.id).match(/^(\d+)/);return(bM?parseInt(bM[1]):0)-(aM?parseInt(aM[1]):0);});$('badgeArchived').textContent=arch.length;$('archivedBody').innerHTML=arch.map(r=>`<tr class="${selectedArch.has(r.id)?'selected':''}"><td class="cell-checkbox"><input type="checkbox" ${selectedArch.has(r.id)?'checked':''} onchange="App.toggleSelArch('${r.id}')"></td><td class="cell-id">${r.id}</td><td>${r.nombreProyecto}</td><td><span class="cell-code">${r.codigoProyecto}</span></td><td>${r.archivadoPor||'—'}</td><td class="cell-date">${formatDateTime(r.fechaArchivado)}</td><td><button class="btn btn-success" onclick="App.restoreSingle('${r.id}')" style="padding:0.12rem 0.25rem;font-size:0.52rem">♻️</button></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty-state"><div class="icon">📦</div></div></td></tr>';}
    
    function renderSolicitudes(){const pend=solicitudes.filter(s=>s.estado==='pendiente').sort((a,b)=>getDaysRemaining(a.fechaLimite)-getDaysRemaining(b.fechaLimite));const todas=[...solicitudes].sort((a,b)=>new Date(b.fechaEnvio)-new Date(a.fechaEnvio));$('badgePending').textContent=pend.length;const grid=$('solicitudesGrid');if(!pend.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="icon">✅</div><h3>Sin pendientes</h3></div>';}else{grid.innerHTML=pend.map(s=>{const d=getDaysRemaining(s.fechaLimite);const u=getUrgencyClass(d);return`<div class="solicitud-card ${u}"><div><div class="solicitud-title">${s.proyecto}</div><div class="solicitud-id">Caja #${s.recordId}</div></div><div class="solicitud-info"><span>📧 ${s.destinatario}</span><span>👤 ${s.enviadoPor}</span></div><div class="countdown ${u}"><div class="countdown-icon">${d<=5?'🚨':'⏰'}</div><div><div class="countdown-days">${d<=0?'VENC':d+'d'}</div><div class="countdown-label">restantes</div></div></div><div class="solicitud-actions"><button class="btn btn-success" onclick="App.openCompleteModal(${s.id})">✅</button><button class="btn btn-secondary" onclick="App.resendEmail(${s.id})">📧</button></div></div>`;}).join('');}$('solicitudesHistoryBody').innerHTML=todas.slice(0,50).map(s=>`<tr><td class="cell-date">${formatDateTime(s.fechaEnvio)}</td><td class="cell-id">${s.recordId}</td><td>${s.proyecto}</td><td>${s.destinatario}</td><td><span class="log-type-badge ${s.estado==='completada'?'log-complete':'log-email'}">${s.estado==='completada'?'✅':'⏳'}</span></td><td>${s.estado==='pendiente'?`<button class="btn btn-success" onclick="App.openCompleteModal(${s.id})" style="padding:0.08rem 0.15rem;font-size:0.42rem">✅</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state"><div class="icon">📧</div></div></td></tr>';}
    function resendEmail(solId){const sol=solicitudes.find(s=>s.id===solId);if(sol){const rec=db.find(r=>r.id==sol.recordId);if(rec){openEmailModal(db.indexOf(rec));$('emailTo').value=sol.destinatario;}}}
    
    function renderDestruction(){const items=db.filter(r=>!r.archivado&&r.fechas?.informe).map(r=>{const d5=getDaysTo5Years(r.fechas.informe);return{...r,daysTo5:d5,fecha5:get5YearDate(r.fechas.informe)};}).filter(r=>r.daysTo5<=730).sort((a,b)=>a.daysTo5-b.daysTo5);const urgent=items.filter(r=>r.daysTo5<=CONFIG.alertas.destruccion);$('badgeDestruct').textContent=urgent.length;$('statDestruct').textContent=urgent.length;$('statDestructCard').style.display=urgent.length>0?'block':'none';const grid=$('destructGrid');if(!urgent.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="icon">✅</div><h3>Sin urgentes</h3></div>';}else{grid.innerHTML=urgent.map(r=>`<div class="destruct-card ${r.daysTo5<=30?'':'warning'}"><div class="title">${r.nombreProyecto}</div><div class="id">Caja #${r.id}</div><div class="info"><p>📅 Informe: ${formatDate(r.fechas.informe)}</p><p>🔥 5 años: ${formatDate(r.fecha5)}</p></div><div class="countdown"><div class="days">${r.daysTo5<=0?'VENC':r.daysTo5+'d'}</div><div class="label">${r.daysTo5<=0?'Destruir':'restantes'}</div></div></div>`).join('');}$('destructTableBody').innerHTML=items.map(r=>`<tr class="${r.daysTo5<=CONFIG.alertas.destruccion?'destruct-warning':''}"><td class="cell-id">${r.id}</td><td>${r.nombreProyecto}</td><td class="cell-date">${formatDate(r.fechas.informe)}</td><td class="cell-date">${formatDate(r.fecha5)}</td><td><span class="destruct-badge ${r.daysTo5<=30?'urgent':r.daysTo5<=CONFIG.alertas.destruccion?'warning':'ok'}">${r.daysTo5<=0?'VENC':r.daysTo5+'d'}</span></td><td>${r.daysTo5<=0?'⚠️':'⏳'}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state"><div class="icon">📋</div></div></td></tr>';}
    
    function renderTrash(search=''){const items=trash.filter(r=>!search||JSON.stringify(r).toLowerCase().includes(search)).sort((a,b)=>new Date(b.deletedAt)-new Date(a.deletedAt));$('badgeTrash').textContent=trash.length;$('trashBody').innerHTML=items.map(r=>`<tr class="${selectedTrash.has(r.id)?'selected':''}"><td class="cell-checkbox"><input type="checkbox" ${selectedTrash.has(r.id)?'checked':''} onchange="App.toggleSelTrash('${r.id}')"></td><td class="cell-id">${r.id}</td><td>${r.nombreProyecto}</td><td><span class="cell-code">${r.codigoProyecto}</span></td><td>${r.deletedBy||'—'}</td><td class="cell-date">${formatDateTime(r.deletedAt)}</td><td><div class="action-btns"><button class="btn-restore" onclick="App.restoreSingleTrash('${r.id}')">♻️</button><button class="btn-delete" onclick="App.deletePermanent('${r.id}')">❌</button></div></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty-state"><div class="icon">🗑️</div><h3>Vacía</h3></div></td></tr>';}
    
    function renderLogs(){const filterType=$('logFilterType')?.value||'';const searchTerm=$('logSearch')?.value?.toLowerCase()||'';let fl=logs;if(filterType)fl=fl.filter(l=>l.action===filterType);if(searchTerm)fl=fl.filter(l=>JSON.stringify(l).toLowerCase().includes(searchTerm));$('logSessions').textContent=logs.filter(l=>l.action==='LOGIN').length;$('logEmails').textContent=logs.filter(l=>l.action==='EMAIL').length;$('logCompleted').textContent=logs.filter(l=>l.action==='COMPLETE').length;$('logEdits').textContent=logs.filter(l=>l.action==='UPDATE').length;$('logTI').textContent=logs.filter(l=>l.action==='TI_UPDATE').length;$('badgeLogs').textContent=logs.length;const labels={LOGIN:'🔓',LOGOUT:'🔒',VIEW:'👁',CREATE:'➕',UPDATE:'✏️',DELETE:'🗑️',ARCHIVE:'📦',RESTORE:'♻️',EMAIL:'📧',COMPLETE:'✅',SYNC:'🔄',TI_UPDATE:'🖥️'};$('logsBody').innerHTML=fl.slice(0,300).map(l=>`<tr><td class="cell-date">${formatDateTime(l.ts)}</td><td><strong style="font-size:0.52rem">${l.userName||l.user}</strong></td><td><span class="log-type-badge log-${l.action?.toLowerCase()}">${labels[l.action]||l.action}</span></td><td class="cell-id">${l.recordId||'—'}</td><td style="max-width:240px;white-space:normal;word-wrap:break-word;font-size:0.52rem">${l.details||'—'}</td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state"><div class="icon">📜</div></div></td></tr>';}
    
    function renderAll(){renderArchived();renderSolicitudes();renderDestruction();renderTrash();renderLogs();renderOnlineUsers();}
    function changePage(d){const total=Math.ceil(filtered.length/perPage)||1;page=Math.max(1,Math.min(total,page+d));render();}
    function changePerPage(){perPage=parseInt($('perPageSelect').value);page=1;render();}
    function updateStats(){const active=db.filter(r=>!r.archivado);const pending=solicitudes.filter(s=>s.estado==='pendiente').length;$('statTotal').textContent=active.length;$('statPending').textContent=pending;$('statPendingCard').style.display=pending>0?'block':'none';}
    
    // Export
    function exportToExcel(){const user=Auth.get();log('EXPORT',null,`Excel - ${user?.name}`);const rows=db.filter(r=>!r.archivado).map(r=>[r.id,r.nombreProyecto,r.codigoProyecto,r.codigoValidacion||'',r.patrocinador,r.equipo||'',r.areas?.analitica?.estado||'',r.areas?.calidad?.estado||'',r.areas?.clinica?.estado||'',r.areas?.estadistico?.estado||'',r.estatus,r.urlEstatus||'',r.fechas?.informe||'',r.fechas?.destruccion||'',r.fechas?.solicitudTI||'',r.observaciones||'',r.observacionesTI||'',r.urlTI||'',r.idSecundario||'',r.ubicacion,r.resguardo]);const ws=XLSX.utils.aoa_to_sheet([['Caja','Nombre','Código','Validación','Patrocinador','Equipo','Analítica','Calidad','Clínica','Estadístico','Estatus','URL','Informe','Destrucción','Sol.TI','Observaciones','Obs.TI','URL TI','ID','Ubicación','Resguardo'],...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Estudios');XLSX.writeFile(wb,`Listado_${new Date().toISOString().split('T')[0]}.xlsx`);saveToCloud();toast('Exportado');}
    function exportLogs(){const rows=logs.map(l=>[formatDateTime(l.ts),l.userName||l.user,l.action,l.recordId||'',l.details||'']);const ws=XLSX.utils.aoa_to_sheet([['Fecha','Usuario','Acción','Registro','Detalles'],...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Historial');XLSX.writeFile(wb,`Historial_${new Date().toISOString().split('T')[0]}.xlsx`);toast('Exportado');}
    function exportBackup(){const backup={registros:db,solicitudes,logs,papelera:trash,fecha:new Date().toISOString()};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Backup_${new Date().toISOString().split('T')[0]}.json`;a.click();toast('Respaldo descargado');}
    
    // Login/Logout
    async function handleLogin(e){
        e.preventDefault();
        const u=$('loginUser').value.trim();
        const p=$('loginPass').value;
        const result=Auth.verify(u,p);
        if(result.ok){
            sessionStorage.setItem('session',JSON.stringify(result.user));
            if(typeof INITIAL_DATA!=='undefined'&&INITIAL_DATA.length>0&&db.length===0)db=[...INITIAL_DATA];
            await loadFromCloud();
            log('LOGIN',null,`Inicio: ${result.user.name}`);await saveToCloud();
            $('loginScreen').style.display='none';$('appContainer').classList.add('active');
            updateUI();startSync();await updateOnlineStatus();applyFilters();renderAll();toast('Bienvenido '+result.user.name,'success');
        }else{
            $('loginError').classList.add('show');setTimeout(()=>$('loginError').classList.remove('show'),3000);
        }
    }
    
    async function handleLogout(){
        const sid=Auth.getSid();
        delete onlineUsers[sid];
        try{await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.online),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(onlineUsers)});}catch{}
        const name=Auth.logout();
        log('LOGOUT',null,`Cierre: ${name}`);await saveToCloud();stopSync();sessionStorage.removeItem('session');
        $('appContainer').classList.remove('active');$('loginScreen').style.display='flex';
    }
    
    async function checkSession(){
        if(typeof INITIAL_DATA!=='undefined'&&INITIAL_DATA.length>0&&db.length===0)db=[...INITIAL_DATA];
        const s=sessionStorage.getItem('session');
        if(s){
            const data=JSON.parse(s);
            if(Auth.restore(data)){
                await loadFromCloud();
                $('loginScreen').style.display='none';$('appContainer').classList.add('active');
                updateUI();startSync();await updateOnlineStatus();applyFilters();renderAll();
            }
        }else{
            try{const res=await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.online));if(res.ok){const online=await res.json();$('loginOnlineCount').textContent=Object.values(online).filter(u=>u&&Date.now()-(u.lastSeen||0)<CONFIG.app.sessionTimeout).length;}}catch{}
        }
    }
    
    function initDragScroll(){const wrapper=$('mainTableWrapper');if(!wrapper)return;let isDown=false,startX,scrollLeft;wrapper.addEventListener('mousedown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;isDown=true;wrapper.style.cursor='grabbing';startX=e.pageX-wrapper.offsetLeft;scrollLeft=wrapper.scrollLeft;});wrapper.addEventListener('mouseleave',()=>{isDown=false;wrapper.style.cursor='grab';});wrapper.addEventListener('mouseup',()=>{isDown=false;wrapper.style.cursor='grab';});wrapper.addEventListener('mousemove',e=>{if(!isDown)return;e.preventDefault();wrapper.scrollLeft=scrollLeft-(e.pageX-wrapper.offsetLeft-startX)*2;});}
    
    function init(){
        checkSession();initDragScroll();
        document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m){closeModal();closeEmailModal();closeCompleteModal();closeDetail();closeTIModal();}}));
        document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeEmailModal();closeCompleteModal();closeDetail();closeImg();closeTIModal();}});
        window.addEventListener('beforeunload',async()=>{const sid=Auth.getSid();delete onlineUsers[sid];if(Auth.isAuth()){try{await fetch(CONFIG.getApiUrl(CONFIG.cloud.baskets.online),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(onlineUsers)});}catch{}}});
    }
    
    return {
        init,handleLogin,handleLogout,forceSync,switchTab,
        openModal,closeModal,saveRecord,toggleInc,
        previewFiles,removeFile,showImg,closeImg,
        openTIModal,closeTIModal,previewTIFiles,removeTIFile,saveTIObservaciones,
        deleteRecord,viewDetail,closeDetail,
        openEmailModal,closeEmailModal,sendEmail,
        openCompleteModal,closeCompleteModal,previewCompleteFiles,confirmComplete,
        toggleSelectAll,toggleSel,archiveSelected,archiveSingle,
        toggleSelectAllArchived,toggleSelArch,restoreSelected,restoreSingle,
        toggleSelectAllTrash,toggleSelTrash,restoreFromTrash,restoreSingleTrash,deletePermanent,emptyTrash,
        filterTrash,filterArchived,applyFilters,changePage,changePerPage,
        exportToExcel,exportLogs,exportBackup,resendEmail
    };
})();

document.addEventListener('DOMContentLoaded',()=>App.init());
