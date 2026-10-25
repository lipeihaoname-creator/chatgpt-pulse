const colors=['#a4d3f8','#d4b8f0','#a4ddb8','#f2a8c7','#e5c38b','#9ce4df'];
const shapes=['●','◆','▰'];
export function taskTag(id){let hash=2166136261;for(const c of id||'')hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;return {color:colors[hash%colors.length],shape:shapes[Math.floor(hash/colors.length)%shapes.length]};}
