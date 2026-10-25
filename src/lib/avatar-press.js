// DOM primary buttons are logical (button 0 / buttons bit 1), even with
// Windows left-handed mapping. Never infer clicks from a native drag return.
export function avatarPress() {
  let press=null;
  return {
    begin(event) {
      if(event.button!==0)return false;
      press={x:event.clientX,y:event.clientY,at:Date.now()};
      return true;
    },
    move(event) {
      if(!press)return false;
      if(!(event.buttons&1)){press=null;return false;}
      if(Math.hypot(event.clientX-press.x,event.clientY-press.y)<5)return false;
      press=null;return true;
    },
    finish(event,nativePointer=false) {
      if(event.button!==0){press=null;return false;}
      const tap=event.detail===0||!nativePointer&&!!press&&
        Date.now()-press.at<750&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<5;
      press=null;return tap;
    },
    cancel(){press=null;}
  };
}
