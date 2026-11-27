import * as T from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import type { WorldView } from "./types";
import { createResearchVessel, createWaveBuoy } from "./marine-vessel";
import { sampleVesselWave, SEA_SWELLS, VESSEL_HEAVE_SCALE } from "./wave-field";

const media = "/worlds/marine/";
const sunDirection = new T.Vector3(-0.654, 0.752, -0.081).normalize();
const skySampling = `
uniform sampler2D uSky;
uniform float uSkyReady;
vec3 readSky(vec3 ray) {
  ray=normalize(ray);
  vec2 uv=vec2(0.08+atan(ray.z,ray.x)/6.2831853,0.5+asin(clamp(ray.y,-1.0,1.0))/3.14159265);
  vec3 photograph=texture2D(uSky,uv).rgb;
  vec3 gradient=mix(vec3(.61,.71,.76),vec3(.14,.35,.59),smoothstep(-.03,.72,ray.y));
  return mix(gradient,photograph,uSkyReady);
}`;
const coefficients = SEA_SWELLS.map(
  ([a, k, w, offset, phase]) =>
    `{float angle=uDir+${offset.toFixed(5)};vec2 d=vec2(sin(angle),cos(angle));float a=${a.toFixed(5)}*uGain;
  float f=${w.toFixed(5)}*uTime-${k.toFixed(5)}*dot(p,d)+${phase.toFixed(5)};
  h+=a*sin(f);g-=a*${k.toFixed(5)}*cos(f)*d;}`,
).join("\n");
const waveGLSL = `
uniform float uTime,uGain,uDir;
void swell(vec2 p,out float h,out vec2 g){h=0.;g=vec2(0.);${coefficients}}
void shortWave(vec2 p,vec2 k,float freq,float amplitude,float phase,inout float h,inout vec2 g) {
  float a=dot(p,k)-freq*uTime+phase;
  h+=amplitude*(sin(a)-.18*cos(2.*a));
  g+=amplitude*(cos(a)+.36*sin(2.*a))*k;
}
void crossingSeas(vec2 p, inout float h,inout vec2 g) {
  // Short waves run across the longer encounter swells. At hull scale their
  // displacement averages out, but their steep asymmetric faces break the surface.
  float a=uDir+.72;vec2 d=vec2(sin(a),cos(a)),q=vec2(d.y,-d.x);
  float local=(1.-smoothstep(100.,460.,length(p)))*uGain;
  float ch=0.;vec2 dg=vec2(0.);
  shortWave(p,d*.32+q*.06,1.81,.30,1.3,ch,dg);
  shortWave(p,d*.54-q*.28,2.37,.16,2.4,ch,dg);
  shortWave(p,d*.15+q*.72,2.69,.11,.72,ch,dg);
  shortWave(p,d*.90+q*.48,3.17,.078,4.44,ch,dg);
  h+=ch*local;g+=dg*local;
}
`;
// Concentrate vertices near the vessel and the camera. The rings span the photographed horizon.
function radialSurface() {
  const rings = 128,
    steps = 224,
    position: number[] = [0, 0, 0],
    indices: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const radius = 2600 * (r / rings) ** 2.65;
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      position.push(radius * Math.cos(angle), 0, radius * Math.sin(angle));
      const j = 1 + (r - 1) * steps + i,
        k = 1 + (r - 1) * steps + ((i + 1) % steps);
      if (r === 1) {
        indices.push(0, k, j);
      } else {
        indices.push(j - steps, k, j, j - steps, k - steps, k);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  geo.setIndex(indices);
  return geo;
}
const waterVertex = `
varying vec3 vPos;
varying vec4 vMirror;
uniform mat4 textureMatrix;
${waveGLSL}
void main(){
  vec2 p=vec2(position.x,-position.y);float h;vec2 g;swell(p,h,g);
  crossingSeas(p,h,g);
  vMirror=textureMatrix*vec4(position,1.);
  vPos=vec3(p.x,h,p.y);gl_Position=projectionMatrix*viewMatrix*vec4(vPos,1.);
}`;
const waterFragment = `
varying vec3 vPos;
varying vec4 vMirror;
${waveGLSL}
${skySampling}
uniform sampler2D uWind;
uniform sampler2D tDiffuse;
uniform float uWindReady;
uniform vec3 uSun;
void main(){
  float h;vec2 g;swell(vPos.xz,h,g);
  float depth=length(cameraPosition-vPos);
  crossingSeas(vPos.xz,h,g);
  float footprint=max(length(dFdx(vPos.xz)),length(dFdy(vPos.xz)));
  g*=1.-smoothstep(2.5,22.,footprint);
  vec2 p=vPos.xz;
  vec2 flow=vec2(sin(uDir),cos(uDir));
  mat2 crossWind=mat2(.84,-.542,.542,.84);
  vec2 refraction=.65*vec2(sin(p.y*.12+p.x*.058+uTime*.19),cos(p.x*.12-p.y*.067-uTime*.23));
  vec3 n1=texture2D(uWind,(p+refraction)*.026-flow*uTime*.016).rgb;
  vec3 n2=texture2D(uWind,crossWind*(p+1.5*refraction)*.072+flow*uTime*.025).rgb;
  vec3 n3=texture2D(uWind,p*.21+vec2(uTime*.038,-uTime*.025)).rgb;
  vec2 ripple=(n1.rg-.5)*.64+crossWind*(n2.rg-.5)*.37+(n3.rg-.5)*.16;
  ripple*=uWindReady*(.55+.63*uGain)*(1.-smoothstep(95.,1450.,depth));
  vec3 normal=normalize(vec3(-g.x-ripple.x,1.,-g.y-ripple.y));
  vec3 viewDir=normalize(cameraPosition-vPos);
  vec3 reflectDir=reflect(-viewDir,normal);reflectDir.y=abs(reflectDir.y);
  vec3 reflection=readSky(reflectDir);
  float nv=max(0.,dot(viewDir,normal));
  float fresnel=.028+.872*pow(1.-nv,4.3);
  float diffuse=clamp(dot(normal,uSun)*.7+.2,0.,1.);
  float crest=smoothstep(-.85,1.3,h);
  vec3 volume=mix(vec3(.006,.039,.063),vec3(.016,.141,.169),crest*.55+diffuse*.35);
  vec3 water=mix(volume,reflection*.81,fresnel);
  // Hull extinction and approximate hull reflection directly underneath the waterline.
  float side=abs(p.y);
  float beam=4.7*(1.-.65*smoothstep(8.,21.,p.x));
  float hullRange=smoothstep(-26.,-17.,p.x)*(1.-smoothstep(19.,26.,p.x));
  float hullShade=exp(-pow(max(side-beam,0.)*.33,1.2))*hullRange;
  water*=1.-hullShade*.42;
  // The offscreen mirror sees the actual hull and its moving equipment. Distort the
  // lookup with local wave slopes and fade into the photographic sky outside the hull.
  vec2 projected=vMirror.xy/vMirror.w;
  vec2 distortion=vec2(normal.x*.037+normal.z*.019,normal.z*.080);
  vec3 shipReflection=texture2D(tDiffuse,clamp(projected+distortion,.001,.999)).rgb;
  float nearVessel=exp(-max(side-beam,0.)*.085)*smoothstep(-36.,-20.,p.x)*(1.-smoothstep(17.,32.,p.x));
  water=mix(water,shipReflection*.69,nearVessel*(.34+.38*fresnel));
  vec3 halfDir=normalize(viewDir+uSun);
  float glint=pow(max(dot(halfDir,normal),0.),330.);
  water+=vec3(1.,.90,.67)*glint*1.9;
  // Windswept breakers and the fragmented seam of white water beside the ship.
  float windCrest=smoothstep(.14,.29,dot(g+ripple,flow))*smoothstep(.28,1.15,h);
  float network=smoothstep(.26,.79,max(n1.b*.95,n2.b*.76));
  float whitecaps=windCrest*network*(.3+.6*uGain);
  float shoulder=abs(side-beam-.53-.28*sin(p.x*.84-uTime*1.5));
  float contact=exp(-shoulder*.93);
  float bowWash=hullRange*contact*(.14+.94*network)*(.78+.22*sin(p.x*1.45+p.y*2.-uTime));
  float astern=clamp((-p.x-17.)/27.,0.,1.);
  float wakeLine=abs(side-(4.2+astern*4.8+.45*sin(p.x*.8+uTime)));
  float wake=exp(-wakeLine*1.40)*smoothstep(0.,.14,astern)*(1.-smoothstep(.35,1.,astern))*network*.8;
  float foam=clamp(whitecaps+bowWash+wake,0.,.86);
  water=mix(water,vec3(.66,.79,.79),foam);
  float haze=1.-exp(-depth*.00087);
  vec3 horizon=readSky(normalize(vec3(-viewDir.x,.018,-viewDir.z)));
  vec3 distantWater=mix(vec3(.025,.11,.15),horizon*.80,.64);
  water=mix(water,distantWater,smoothstep(4.,30.,footprint)*.80);
  water=mix(water,horizon*.89,haze*.89);
  gl_FragColor=vec4(water,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createMarineWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(33, 1, 0.18, 3200);
  scene.name = "North Atlantic research station";
  const resources = new T.TextureLoader(manager);
  const skyReady = { value: 0 },
    windReady = { value: 0 };
  const sky = resources.load(media + "broken-cloud-sky.jpg", (texture) => {
    skyReady.value = 1;
    texture.mapping = T.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 0.68;
    scene.environmentRotation.y = -0.42 * Math.PI * 2;
  });
  sky.colorSpace = T.SRGBColorSpace;
  sky.wrapS = T.RepeatWrapping;
  const wind = resources.load(media + "wind-surface.jpg", () => {
    windReady.value = 1;
  });
  wind.wrapS = wind.wrapT = T.RepeatWrapping;
  wind.anisotropy = 4;
  const shared = { uSky: { value: sky }, uSkyReady: skyReady };
  const skyMat = new T.ShaderMaterial({
    uniforms: shared,
    side: T.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vRay;void main(){vRay=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vRay;${skySampling}
    void main(){gl_FragColor=vec4(readSky(vRay),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const dome = new T.Mesh(new T.SphereGeometry(2950, 48, 24), skyMat);
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  scene.add(dome);
  const u = {
    ...shared,
    uWind: { value: wind },
    uWindReady: windReady,
    uTime: { value: 0 },
    uDir: { value: 0.6 },
    uGain: { value: 0.6 },
    uSun: { value: sunDirection },
  };
  const water = new Reflector(radialSurface().rotateX(Math.PI / 2), {
    textureWidth: 512,
    textureHeight: 320,
    clipBias: 0.0025,
    multisample: 0,
    shader: {
      uniforms: {
        textureMatrix: { value: null },
        tDiffuse: { value: null },
        color: { value: null },
      },
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
    },
  });
  Object.assign((water.material as T.ShaderMaterial).uniforms, u);
  water.rotation.x = -Math.PI / 2;
  water.frustumCulled = false;
  water.name = "Ocean and white water";
  scene.add(water);
  const vessel = createResearchVessel(),
    buoy = createWaveBuoy();
  scene.add(vessel.ship, buoy);
  vessel.ship.name = "R/V Aurelia";
  scene.add(new T.HemisphereLight(0xc8e1f3, 0x477077, 1.35));
  const sun = new T.DirectionalLight(0xffe8ca, 2.8);
  sun.position.copy(sunDirection).multiplyScalar(65);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -32,
    right: 32,
    top: 27,
    bottom: -27,
    near: 4,
    far: 125,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  scene.add(sun);
  const fill = new T.DirectionalLight(0x94c6e5, 0.55);
  fill.position.set(-31, 12, -28);
  scene.add(fill);
  const gaze = new T.Vector3(),
    orientation = new T.Euler(0, 0, 0, "ZXY");
  const buoyX = -26.5,
    buoyZ = 6.5;
  return {
    scene,
    camera,
    update(frame, aspect) {
      const { t } = frame;
      u.uTime.value = t;
      u.uGain.value = frame.waveHeight;
      u.uDir.value = frame.waveDirection;
      const shipY = frame.baseHeave / VESSEL_HEAVE_SCALE;
      water.position.y = shipY;
      vessel.ship.position.y = shipY;
      orientation.set(frame.baseRoll, 0, -frame.basePitch, "ZXY");
      vessel.ship.quaternion.setFromEuler(orientation);
      vessel.updateSensor(frame, vessel.ship.quaternion);
      vessel.radar.rotation.y = t * 1.85;
      const b = sampleVesselWave(t, frame.waveHeight, frame.waveDirection, buoyX, buoyZ);
      buoy.position.set(buoyX, b.height, buoyZ);
      buoy.rotation.set(b.roll, 0, -b.pitch, "ZXY");
      const distance = Math.max(1, 1.68 / aspect);
      camera.position.set(
        35 * distance + 0.74 * Math.sin(t * 0.105),
        14.3 * distance + 0.48 * Math.sin(t * 0.69),
        47 * distance + 0.65 * Math.cos(t * 0.12),
      );
      gaze.set(2.3, 5 + 0.14 * Math.sin(t * 0.63), 0);
      camera.lookAt(gaze);
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
    },
    dispose() {
      sky.dispose();
      wind.dispose();
      sun.shadow.dispose();
      water.getRenderTarget().dispose();
    },
  };
}
