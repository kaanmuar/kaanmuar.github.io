// Fragment shader for the Fusion look (#1791), cut from designs/3d/shaders.js: COMMON, the three libs it uses, and `fusion`.
// uMode: 0 hero, 1 banner, 2 section background (dimmer, half speed). uSubject/uZoom place the centrepiece per format.

export const COMMON = /* glsl */ `
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uMode;
uniform vec2 uSubject; uniform float uZoom; uniform float uFocus;
out vec4 outColor;

const vec3 BG = vec3(.027,.067,.086);      // #071116
const vec3 INK = vec3(.063,.133,.149);     // #102226, mark tile
const vec3 DEEP = vec3(.051,.431,.463);    // #0d6e76
const vec3 TEAL = vec3(.302,.702,.733);    // #4db3bb
const vec3 CYAN = vec3(.494,.965,.984);    // #7ef6fb
const vec3 GOLD = vec3(.886,.769,.541);    // #e2c48a
const vec3 MINT = vec3(.435,.890,.694);    // #6fe3b1
const vec3 CORAL = vec3(.953,.604,.545);   // #f39a8b
const vec3 VIOLET = vec3(.725,.659,1.);    // #b9a8ff
const vec3 PEARL = vec3(.914,.992,1.);     // #e9fdff, mark spine

float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p+n)); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
	return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+1.), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
	for(int i=0;i<5;i++){ s += a*vnoise(p); p = m*p; a *= .5; } return s; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }
float tm(){ return uTime*(uMode > 1.5 ? .5 : 1.); }
vec2 frameP(){ return ((gl_FragCoord.xy - .5*uRes)/uRes.y - uSubject)*uZoom; }
float px(){ return uZoom/uRes.y; }

vec3 spectrum(float s){
	s = clamp(s,0.,1.)*5.;
	if(s < 1.) return mix(VIOLET, TEAL, s);
	if(s < 2.) return mix(TEAL, CYAN, s-1.);
	if(s < 3.) return mix(CYAN, MINT, s-2.);
	if(s < 4.) return mix(MINT, GOLD, s-3.);
	return mix(GOLD, CORAL, s-4.);
}

float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p-a, ba = b-a; return length(pa - ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.)); }
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2){
	vec2 e0 = p1-p0, e1 = p2-p1, e2 = p0-p2, v0 = p-p0, v1 = p-p1, v2 = p-p2;
	vec2 q0 = v0 - e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.);
	vec2 q1 = v1 - e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.);
	vec2 q2 = v2 - e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
	float s = sign(e0.x*e2.y - e0.y*e2.x);
	vec2 d = min(min(vec2(dot(q0,q0), s*(v0.x*e0.y-v0.y*e0.x)), vec2(dot(q1,q1), s*(v1.x*e1.y-v1.y*e1.x))), vec2(dot(q2,q2), s*(v2.x*e2.y-v2.y*e2.x)));
	return -sqrt(d.x)*sign(d.y);
}
float sdHex(vec2 p, float r){ const vec3 k = vec3(-.866025404,.5,.577350269); p = abs(p);
	p -= 2.*min(dot(k.xy,p),0.)*k.xy; p -= vec2(clamp(p.x,-k.z*r,k.z*r), r); return length(p)*sign(p.y); }

// The QA-lab mark as a turning, transparent square pyramid seen from a little above:
// teal facets on the left, gold on the right, pearl edges in front, dim edges behind.
struct Glass { vec3 col; vec2 off; float mask; };
Glass glassPyr(vec2 p, float s, float ang, float blur){
	p /= s; blur /= s;
	vec2 A = vec2(0., .62);
	vec2 C[4]; float Z[4];
	for(int k=0;k<4;k++){ float a = ang + float(k)*1.5707963; C[k] = vec2(cos(a)*.5, -.32 - sin(a)*.14); Z[k] = sin(a); }
	Glass g; g.col = vec3(0.); g.off = vec2(0.); g.mask = 0.;
	float aa = blur + .006;
	for(int k=0;k<4;k++){
		int j = (k+1)&3;
		float inside = 1. - smoothstep(-aa, aa, sdTriangle(p, A, C[k], C[j]));
		float front = step(0., Z[k]+Z[j]);
		float am = ang + (float(k)+.5)*1.5707963;
		vec3 tint = mix(TEAL, GOLD, smoothstep(-.35,.35,cos(am)));
		float shade = .55 + .45*clamp((p.y+.4)/1.0, 0., 1.);
		g.col += tint*inside*mix(.12, .30, front)*shade;
		g.off += vec2(cos(am), -sin(am)*.3)*inside*mix(-.035, .07, front);
		g.mask = max(g.mask, inside);
	}
	for(int k=0;k<4;k++){
		int j = (k+1)&3;
		float w = .012 + blur*1.5, k1 = .012/w;
		float e1 = (1. - smoothstep(0., w, sdSeg(p, A, C[k])))*k1;
		float e2 = (1. - smoothstep(0., w, sdSeg(p, C[k], C[j])))*k1;
		float z1 = Z[k], z2 = (Z[k]+Z[j])*.5;
		g.col += mix(TEAL*.55, PEARL*1.15, smoothstep(-.3,.7,z1))*e1*mix(.5, 1., step(0.,z1));
		g.col += mix(TEAL*.45, CYAN, smoothstep(-.3,.7,z2))*e2*mix(.4, .9, step(0.,z2));
	}
	float sweep = fract(uTime*.11);
	float band = exp(-pow(p.x*.8 + p.y*.6 - (sweep*4.-2.), 2.)*40.);
	g.col += PEARL*band*g.mask*.55;
	vec2 ap = p - A;
	float sharp = .012/(.012 + blur*1.5);
	g.col += sharp*PEARL*(.0025/(abs(ap.x*ap.y)*9. + .0006))*exp(-length(ap)*9.)*(.35 + .65*pow(.5+.5*sin(uTime*1.3), 6.))*.08;
	g.col += sharp*PEARL*.012/(length(ap)+.03);
	return g;
}

vec3 finish(vec3 c){
	vec2 uv = gl_FragCoord.xy/uRes;
	vec2 v = (uv-.5)*vec2(uRes.x/uRes.y, 1.);
	c *= 1. - .42*smoothstep(.35, 1.15, length(v)*(uRes.x > uRes.y ? .85 : 1.25));
	if(uMode > 1.5) c = mix(BG, c, .62);
	vec3 hi = .8 + .2*(1. - exp(-(c-.8)*3.));
	c = mix(c, hi, step(vec3(.8), c));
	c += (h21(gl_FragCoord.xy + fract(uTime*7.)*137.) - .5)*.028;
	return clamp(c, 0., 1.);
}
`;

const PYR_LIB = /* glsl */ `
const float PH = 1.3;
const float PS = .95;
float bob(){ return .06*sin(tm()*.8); }
float spin(){ return tm()*.22 + .785; }
vec3 toObj(vec3 p){ p.y += .62 - bob(); p.xz *= rot(spin()); return p/PS; }
// Exact exit from inside the convex pyramid: nearest of its five planes ahead of the ray. Returns (outward normal, distance).
vec4 exitPyr(vec3 o, vec3 d){
	float c = .5*PH/length(vec2(PH, .5));
	vec3 N[5] = vec3[5](vec3(0,-1,0), normalize(vec3(PH,.5,0)), normalize(vec3(-PH,.5,0)), normalize(vec3(0,.5,PH)), normalize(vec3(0,.5,-PH)));
	vec4 best = vec4(0., 1., 0., 1e9);
	for(int i=0;i<5;i++){
		float nd = dot(N[i], d);
		if(nd < 1e-4) continue;
		float t = ((i == 0 ? 0. : c) - dot(N[i], o))/nd;
		if(t < best.w) best = vec4(N[i], t);
	}
	return best;
}
float sdPyr(vec3 p, float h){
	float m2 = h*h + .25;
	p.xz = abs(p.xz); p.xz = (p.z > p.x) ? p.zx : p.xz; p.xz -= .5;
	vec3 q = vec3(p.z, h*p.y - .5*p.x, h*p.x + .5*p.y);
	float s = max(-q.x, 0.), t = clamp((q.y - .5*p.z)/(m2 + .25), 0., 1.);
	float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
	float b = m2*(q.x+.5*t)*(q.x+.5*t) + (q.y-m2*t)*(q.y-m2*t);
	float d2 = min(q.y, -q.x*m2 - q.y*.5) > 0. ? 0. : min(a,b);
	return sqrt((d2 + q.z*q.z)/m2)*sign(max(q.z, -p.y));
}
float mapPyr(vec3 p){ return sdPyr(toObj(p), PH)*PS; }
vec3 norPyr(vec3 p){ const vec2 e = vec2(.0015,-.0015);
	return normalize(e.xyy*mapPyr(p+e.xyy) + e.yyx*mapPyr(p+e.yyx) + e.yxy*mapPyr(p+e.yxy) + e.xxx*mapPyr(p+e.xxx)); }

vec3 env(vec3 d){
	vec3 c = mix(BG*.7, INK*1.5, smoothstep(-.4,.6,d.y));
	c += TEAL*.95*pow(max(dot(d, normalize(vec3(-.9,.35,.45))),0.), 9.);
	c += GOLD*.9*pow(max(dot(d, normalize(vec3(.9,.25,-.25))),0.), 11.);
	c += VIOLET*.22*pow(max(dot(d, normalize(vec3(0.,-.1,-1.))),0.), 4.);
	float a = atan(d.x, d.z);
	c += PEARL*1.5*smoothstep(.035,0.,abs(d.y-.42))*smoothstep(.55,.95,.5+.5*cos(a*3. + tm()*.15));
	c += PEARL*1.2*smoothstep(.05,0.,abs(a-1.25))*smoothstep(-.1,.5,d.y);
	c += CYAN*1.3*smoothstep(.96,1.,d.y);
	c += TEAL*.22*smoothstep(-.05,-.7,d.y) + GOLD*.1*smoothstep(-.3,-.9,d.y)*smoothstep(-.2,.6,d.x);
	return c;
}

vec3 dust(vec2 p, float t){
	vec3 c = vec3(0.);
	for(int i=0;i<3;i++){
		float fi = float(i), sc = 2.5 + fi*3.5;
		vec2 q = p*sc + vec2(fi*7.3, t*(.06 + fi*.04)) + uMouse*(.5 - fi*.15);
		vec2 id = floor(q), f = fract(q) - .5;
		float h = h21(id + fi*11.);
		if(h < .8) continue;
		float r = .07 + .13*h21(id + 7.7);
		float soft = mix(.85, .12, fi/2.);
		float d = length(f - (h22(id) - .5)*.5);
		float disc = 1. - smoothstep(r*(1.-soft), r, d);
		float rim = smoothstep(r*(1.-soft*.4), r, d)*disc;
		c += mix(TEAL, GOLD, h21(id+1.))*(disc*.18 + rim*.25)*(.6 + .4*sin(t*1.5 + h*40.))*mix(.7, 1., fi/2.);
	}
	return c;
}
`;

const SKY_LIB = /* glsl */ `
vec3 sky(vec2 p, float t){
	float n1 = fbm(p*1.1 + vec2(t*.03, -t*.02));
	float n2 = fbm(p*1.7 + n1*1.6 + vec2(-t*.025, t*.04));
	vec3 c = mix(BG*.9, INK*1.4, smoothstep(-.7,.6,p.y));
	for(int i=0;i<3;i++){
		float fi = float(i);
		float y0 = .3 - fi*.24 + .2*sin(p.x*(1.1 + fi*.35) + t*(.17 + fi*.05) + fi*2.) + (n2 - .5)*.55;
		float d = p.y - y0, w = .06 + .04*fi;
		float rib = exp(-d*d/(w*w));
		float up = exp(-max(d,0.)*3.2)*smoothstep(-w*1.3, 0., d);
		float streak = .5 + .5*vnoise(vec2(p.x*16. + n1*5., t*.25 + fi*3.));
		vec3 rc = i == 0 ? TEAL : (i == 1 ? GOLD : VIOLET);
		c += rc*(rib*.5 + up*.42)*streak*(i == 2 ? .5 : .75);
	}
	c += CYAN*pow(n2, 4.)*.28;
	vec2 sg = p*60., sid = floor(sg);
	if(h21(sid) > .992) c += PEARL*(1. - smoothstep(0.,.15,length(fract(sg) - .5)))*(.4 + .4*sin(t*2. + h21(sid)*90.));
	return c;
}`;

const BOKEH_LIB = /* glsl */ `
vec3 hexBokeh(vec2 f, float r, float b, vec3 tint, out float a){
	float d = sdHex(f, r);
	a = 1. - smoothstep(-b, b, d);
	float rim = smoothstep(-b*1.6, 0., d)*a;
	float fringe = (1. - smoothstep(-b*.4, b*1.6, d - b*.6)) - a;
	return tint*(.16 + rim*.32) + CORAL*max(fringe, 0.)*.35;
}`;

const fusion = PYR_LIB + SKY_LIB + BOKEH_LIB + /* glsl */ `
const float RING = 1.45;
vec3 ot(float k){ k = mod(k, 7.); return k < 1. ? TEAL : k < 2. ? GOLD : k < 3. ? CYAN : k < 4. ? MINT : k < 5. ? VIOLET : k < 6. ? TEAL : CORAL; }
float orbit(vec3 p, out float id, out vec3 lo){
	vec3 q = p - vec3(0., -.3, 0.);
	const float SEC = 6.2831853/7.;
	float a = atan(q.z, q.x) + tm()*.22;
	float i = floor(a/SEC + .5);
	id = mod(i, 7.);
	float la = a - i*SEC, r = length(q.xz);
	lo = vec3(r*cos(la) - RING, q.y - .22*sin(id*1.7 + tm()*.8), r*sin(la));
	lo.xz *= rot(tm()*.9 + id*2.1);
	lo.xy *= rot(.45 + id);
	vec3 al = abs(lo); al.y *= .7;
	return (al.x + al.y + al.z - .1)*.57735*.7;
}
float fwave(vec2 xz, float t){
	float rr = length(xz);
	float h = sin(xz.x*.6 + t*.8)*.07 + sin(xz.y*.75 - t)*.05 + sin(rr*2.4 - t*2.2)*.07*exp(-rr*.12);
	float dm = length(xz - vec2(uMouse.x*2.5, 1.8 + uMouse.y));
	return h + sin(dm*3. - t*4.)*.08*exp(-dm*.5) - .95;
}
vec3 rackLayer(vec2 p, float z, float fi, vec3 col, float t){
	float bs = clamp(abs(1./z - 1./uFocus)*.075, 0., .13);
	float dim = mix(.4, 1., smoothstep(7., 1., z))*mix(.32, 1., exp(-dot(p, p)*.7));
	const float cs = 1.35;
	vec2 q = (p + uMouse*.06/z)*z + vec2(fi*13.7, fi*7.1 + t*.05*(1. + fi*.15));
	vec2 id = floor(q/cs), f = q - (id + .5)*cs;
	float h = h21(id + fi*17.3);
	if(h < .68) return col;
	f -= (h22(id + fi) - .5)*cs*.3;
	float r = cs*(.1 + .08*h21(id*1.3 + fi));
	float bq = (bs + px())*z, bk = smoothstep(.015,.07,bs);
	vec3 tint = h21(id + 9.) < .55 ? mix(TEAL, CYAN, h21(id+2.)) : (h21(id + 4.) < .8 ? GOLD : VIOLET);
	Glass g = glassPyr(f, r, t*.3*(h - .75)*4. + h*20., bq);
	float ha; vec3 hb = hexBokeh(f, r*.75, bq, tint, ha);
	vec3 sharp = col*(1. - g.mask*.25*dim) + g.col*dim*.5;
	return mix(sharp, mix(col, hb*dim, ha*.55), bk);
}
void main(){
	vec2 p = frameP();
	float t = tm();
	float ang = uMouse.x*.35 + sin(t*.13)*.18;
	vec3 ro = vec3(sin(ang)*4.8, .75 + uMouse.y*.25, cos(ang)*4.8);
	vec3 ta = vec3(0., -.2, 0.);
	vec3 ww = normalize(ta-ro), uu = normalize(cross(ww, vec3(0,1,0))), vv = cross(uu, ww);
	const float FL = 2.3;
	vec3 rd = normalize(p.x*uu + p.y*vv + FL*ww);
	#define PROJ(w) (vec2(dot((w)-ro,uu), dot((w)-ro,vv))/dot((w)-ro,ww)*FL)

	vec3 col = BG;
	if(rd.y > -.08) col = sky(vec2(p.x*.85, p.y*.85 + .12), t)*.9;
	col += TEAL*.28*exp(-abs(rd.y + .03)*16.);

	float rs = mod(t*1.5, 11.), scanIn = smoothstep(0., 1.5, rs)*smoothstep(11., 8., rs);
	float tf = 1e5;
	if(rd.y < -.012){
		tf = (-.95 - ro.y)/rd.y; vec3 pos;
		for(int i=0;i<5;i++){ pos = ro + rd*tf; tf = (fwave(pos.xz, t) - ro.y)/rd.y; }
		pos = ro + rd*tf;
		float h = fwave(pos.xz, t) + .95;
		vec2 g = pos.xz/.22, id = floor(g), f = fract(g) - .5;
		float aa = max(length(fwidth(g)), .001)*.75;
		float r = .1 + .12*smoothstep(-.15,.2,h);
		float dotm = 1. - smoothstep(r - aa, r + aa, length(f));
		dotm = mix(dotm, 3.14*r*r*1.4, smoothstep(.12,.45,aa));
		vec3 dc = mix(DEEP*1.1, CYAN, smoothstep(-.15,.2,h));
		float rr = length(pos.xz), ds = rr - rs;
		float band = exp(-ds*ds*7.)*scanIn, since = max(-ds, 0.)/1.5, hz = h21(id);
		vec3 c = mix(dc*.75, GOLD*1.5, band);
		if(ds < 0.){
			if(hz > .975) c = mix(c, CORAL*1.7, exp(-since*.25)*scanIn);
			else if(hz < .05) c = mix(c, MINT*1.3, exp(-since*.6)*scanIn);
		}
		vec3 fl = BG*.7 + env(reflect(rd, vec3(0,1,0)))*.08 + c*dotm;
		float ca = pow(vnoise(pos.xz*4.2 + t*.35)*vnoise(pos.xz*3.1 - t*.28)*2.3, 3.);
		float pool = exp(-rr*rr*1.4);
		fl += mix(TEAL, GOLD, smoothstep(-.4,.4,pos.x))*ca*pool*1.1 + CYAN*pool*.06;
		fl = mix(INK*1.05 + TEAL*.07, fl, exp(-tf*.13));
		col = mix(col, fl, smoothstep(-.012,-.07,rd.y));
	}

	col = rackLayer(p, 5., 1., col, t);
	col = rackLayer(p, 3.2, 2., col, t);

	vec2 A = PROJ(vec3(-.32,-.2,.15)), B = PROJ(vec3(.3,-.22,.12)), S = PROJ(vec3(0., -.62 + bob() + PH*PS, 0.));
	vec2 din = normalize(vec2(1., -.2)), q = p - A;
	float along = dot(q, din);
	if(along < 0.){
		float perp = abs(q.x*din.y - q.y*din.x);
		col += PEARL*(exp(-perp*perp*9000.) + exp(-perp*perp*350.)*.22)*exp(along*2.4)*(.85 + .15*sin(along*40. + t*8.));
	}
	vec2 qb = p - B;
	float rb = length(qb), aOut = atan(qb.y, qb.x), a0 = -.38 + .04*sin(t*.5), spread = .3;
	float s = (aOut - (a0 - spread*.5))/spread;
	if(s > 0. && s < 1. && qb.x > 0.){
		float bnd = fract(s*6.);
		float fan = smoothstep(0.,.06,s)*smoothstep(1.,.94,s)*(.7 + .3*smoothstep(0.,.2,bnd)*smoothstep(1.,.8,bnd));
		col += spectrum(s)*fan*smoothstep(0.,.12,rb)*exp(-rb*.75)*.7*(.85 + .15*sin(rb*30. - t*5.));
	}

	float tt = 0.; int obj = 0; vec3 glow = vec3(0.);
	float oid; vec3 lo;
	for(int i=0;i<100;i++){
		vec3 pp = ro + rd*tt;
		float dP = mapPyr(pp), dO = orbit(pp, oid, lo);
		glow += ot(oid)*exp(-dO*16.)*.011;
		float d = min(dP, dO);
		if(d < .001){ obj = dP < dO ? 1 : 2; break; }
		tt += d*.85;
		if(tt > 10.) break;
	}
	if(obj == 1){
		vec3 pos = ro + rd*tt, n = norPyr(pos);
		float fre = .04 + .96*pow(1. - max(dot(-rd, n), 0.), 5.);
		vec3 refl = env(reflect(rd, n));
		vec3 rdi = refract(rd, n, 1./1.5);
		vec3 dO = rdi; dO.xz *= rot(spin());
		vec4 ex = exitPyr(toObj(pos), dO);
		vec3 ne = ex.xyz; ne.xz *= rot(-spin()); ne = -ne;
		vec3 tr;
		for(int k=0;k<3;k++){
			vec3 o = refract(rdi, ne, 1.47 + float(k)*.035);
			if(dot(o,o) < .01) o = reflect(rdi, ne);
			tr[k] = (env(o) + VIOLET*.12*smoothstep(.1,.7,o.y))[k];
		}
		vec3 ob = toObj(pos);
		vec3 tint = mix(vec3(1.), mix(TEAL, GOLD, smoothstep(-.12,.12,ob.x - ob.z*.3))*1.3, .55);
		col = mix(tr*tint*1.3*exp(-ex.w*PS*.15) + TEAL*.05, refl, fre);
		float e1 = abs(abs(ob.x) - abs(ob.z));
		float e2 = abs(ob.y) + abs(max(abs(ob.x), abs(ob.z)) - .5);
		float edge = max(smoothstep(.03,0.,e1)*step(.015, ob.y), smoothstep(.035,0.,e2));
		col += CYAN*edge*.9 + PEARL*edge*fre*1.5;
		col += PEARL*pow(max(dot(reflect(rd,n), normalize(vec3(-.4,.8,.5))),0.), 70.)*2.2;
	} else if(obj == 2){
		vec3 pos = ro + rd*tt;
		orbit(pos, oid, lo);
		vec2 e = vec2(.002, 0.); float i1; vec3 l1;
		vec3 n = normalize(vec3(orbit(pos+e.xyy,i1,l1) - orbit(pos-e.xyy,i1,l1), orbit(pos+e.yxy,i1,l1) - orbit(pos-e.yxy,i1,l1), orbit(pos+e.yyx,i1,l1) - orbit(pos-e.yyx,i1,l1)));
		vec3 base = ot(oid);
		float fre = pow(1. - max(dot(-rd, n), 0.), 3.);
		vec3 sh = base*(.25 + .55*max(dot(n, normalize(vec3(.3,.8,.4))), 0.)) + mix(base, PEARL, .5)*fre;
		vec3 aq = abs(lo);
		sh += mix(base, PEARL, .4)*(1. - smoothstep(0., .02, min(min(aq.x, aq.y), aq.z)));
		col = sh;
	}
	col += glow;

	float tw0 = obj > 0 ? min(tt, tf) : tf;
	vec2 o2 = ro.xz, d2 = rd.xz;
	float qa = dot(d2,d2), qb2 = 2.*dot(o2,d2), qd = qb2*qb2 - 4.*qa*(dot(o2,o2) - rs*rs);
	if(qd > 0.){
		for(int k=0;k<2;k++){
			float tw = (-qb2 + (k == 0 ? -1. : 1.)*sqrt(qd))/(2.*qa);
			if(tw > 0. && tw < tw0){
				vec3 w = ro + rd*tw;
				float hf = (w.y + .95)/.85;
				if(hf > 0. && hf < 1.) col += mix(GOLD, CYAN, hf)*pow(1. - hf, 2.)*.16*scanIn*(.6 + .4*vnoise(vec2(atan(w.z, w.x)*8., t)));
			}
		}
	}

	col = rackLayer(p, .8, 6., col, t);
	col = rackLayer(p, .55, 7., col, t);

	vec2 sp = p - S;
	float glint = .35 + .65*pow(.5 + .5*sin(t*1.1), 8.);
	col += PEARL*glint*(.0009/(abs(sp.x)*abs(sp.y)*4. + .00025))*exp(-length(sp)*7.)*.06 + CYAN*glint*.006/(length(sp) + .015);
	col += dust(p, t)*.5;
	outColor = vec4(finish(col), 1.);
}`;

export const SHADERS = { fusion };
