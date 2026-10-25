// Movement is independent of the painted expression and continuous breathing.
// Every gesture ends at neutral; an interruption starts at the current matrix.
export const neutralPose='translate(0px, 0px) rotate(0deg) scale(1)';
export function portraitGesture(kind,character='mai'){
 const strength=character==='roxy'?1:.85;
 // Keep apparent head size fixed. Expression registration handles framing;
 // gestures and breathing only translate/rotate, never add another zoom.
 const pose=(x,y,angle)=>`translate(${x*strength}px, ${y*strength}px) rotate(${angle*strength}deg)`;
 const points={
  smile:[[.3,0,-.6,-.5],[.65,0,-.3,.4]],
  curious:[[.3,.7,-.2,-2],[.65,.7,-.2,-2],[.82,.2,.2,-.5]],
  nod:[[.2,0,1.3,.5],[.4,0,-.4,-.2],[.62,0,1,.3],[.8,0,-.2,0]],
  sway:[[.25,-.7,0,-1.3],[.65,.7,-.2,1.2],[.85,.2,0,.4]],
  stretch:[[.35,0,-1.2,-.3],[.6,0,-1.2,.3],[.82,0,-.3,0]],
  'glance-left':[[.3,-1.3,0,-1],[.65,-1.3,-.2,-1],[.85,-.3,0,-.2]],
  'glance-right':[[.3,1.3,0,1],[.65,1.3,-.2,1],[.85,.3,0,.2]],
  shy:[[.3,.4,.6,1.8],[.65,.4,.6,1.8],[.85,.1,.2,.5]],
  relax:[[.3,0,.6,-.5],[.7,0,.6,-.5]],
  bashful:[[.25,0,.6,-.8],[.5,.3,-.2,.5],[.72,0,.4,-.3]],
  pout:[[.2,-.5,.1,-1],[.42,.5,.1,1],[.62,-.2,0,-.4],[.82,0,0,0]],
  sleepy:[[.35,0,1.1,1.1],[.68,0,1.1,1.1],[.86,0,.4,.3]],
  proud:[[.3,0,-.8,.5],[.64,0,-.8,.5],[.84,0,-.2,.1]],
  greet:[[.3,0,-.8,-.6],[.65,0,.2,.3]],
  celebrate:[[.2,0,-1,-.8],[.42,0,.2,.5],[.65,0,-.5,-.3],[.85,0,.1,.1]]
 }[kind];
 if(!points)return null;
 return {duration:kind==='greet'?720:kind==='celebrate'?1600:4800,frames:points.map(([offset,x,y,a])=>({offset,transform:pose(x,y,a)}))};
}
