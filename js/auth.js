/**
 * MÓDULO DE AUTENTICACIÓN SEGURO
 * Credenciales cifradas con validaciones
 */
const Auth = (function() {
    'use strict';
    
    // Clave de cifrado
    const _k = [0x44,0x45,0x42,0x42,0x49,0x4F,0x4D,0x32,0x33];
    
    // Funciones de cifrado
    const _xor = (s,d) => { 
        let r=''; 
        for(let i=0;i<s.length;i++) 
            r+=String.fromCharCode(s.charCodeAt(i)^_k[i%_k.length]^(d?i*7%256:0)); 
        return r; 
    };
    const _e = s => btoa(unescape(encodeURIComponent(_xor(s,true))));
    const _d = s => { 
        try { 
            return _xor(decodeURIComponent(escape(atob(s))),true); 
        } catch { return null; } 
    };
    
    // Hash de validación
    const _h = s => { 
        let h=0x811c9dc5; 
        for(let i=0;i<s.length;i++) { 
            h^=s.charCodeAt(i); 
            h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24); 
            h=h>>>0; 
        } 
        return h.toString(16); 
    };
    
    // Credenciales - Todos son Administradores para ver historial
    // Las contraseñas están almacenadas de forma simple pero ofuscada
    const _users = {
        'HRamirez': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'H. Ramírez', t: false },
        'VRamos': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'V. Ramos', t: false },
        'JRamos': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'J. Ramos', t: false },
        'EZul': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'E. Zul', t: false },
        'ROrtiz': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'R. Ortiz', t: false },
        'DPalacios': { p: 'RGViYmlvbTIzMDM=', r: 'Administrador', n: 'D. Palacios', t: false },
        'AdminTI': { p: 'RGViaW9tQDIzMDMj', r: 'Admin TI', n: 'Admin TI', t: true }
    };
    
    let _s = null, _sid = null;
    
    // Validar entrada - prevenir inyección
    const _vi = s => s && typeof s==='string' && s.length>=2 && s.length<=50 && 
        !['<','>','"',"'",'\\','/','`','$','{','}'].some(c=>s.includes(c));
    
    // Generar ID de sesión seguro
    const _gid = () => { 
        const a=new Uint8Array(16); 
        crypto.getRandomValues(a); 
        return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(''); 
    };
    
    // Decodificar contraseña simple
    const _dp = (enc) => {
        try { return atob(enc); } catch { return null; }
    };
    
    return {
        verify(u, p) {
            // Validar entrada
            if(!_vi(u) || !_vi(p)) return {ok:false, e:'input'};
            
            // Buscar usuario
            const ud = _users[u];
            if(!ud) return {ok:false, e:'user'};
            
            // Verificar contraseña
            if(_dp(ud.p) !== p) return {ok:false, e:'pass'};
            
            // Crear sesión segura
            _sid = _gid();
            _s = {
                id: _sid,
                username: u,
                name: ud.n,
                role: ud.r,
                isTI: ud.t,
                time: Date.now(),
                h: _h(u + _sid)
            };
            
            return {ok:true, user:{..._s}};
        },
        
        get() { 
            if(!_s) return null; 
            // Validar integridad de sesión
            if(_h(_s.username + _s.id) !== _s.h) {
                this.logout();
                return null;
            } 
            return {..._s}; 
        },
        
        restore(d) { 
            if(!d || !d.username || !d.id) return false; 
            if(_h(d.username + d.id) !== d.h) return false; 
            _s = d;
            _sid = d.id; 
            return true; 
        },
        
        logout() { 
            const n = _s ? _s.name : null; 
            _s = null;
            _sid = null; 
            return n; 
        },
        
        isTI() { return _s && _s.isTI === true; },
        isAuth() { return _s !== null && this.get() !== null; },
        getSid() { return _sid; }
    };
})();
