// Original fan dialogue, inspired by character interviews. Not original-script quotes.
export const dialoguePools={
 idle:['又来看我了？先把今天的小目标说清楚。','不必一直盯着数字。我又不会跑掉。','在开始之前，先把肩膀放松。','今天也按自己的步调来，好吗？','看我可以，记得也看看你的计划。','准备好了就开始，我在旁边。'],
 working:['现在就想要答案？给思路一点时间。','别催，认真做事时需要一点耐心。','有进展就好，不必和数字较劲。','这么在意结果？先把眼前这一步做好。','你专心做你的，我替你留意动静。','等一等也没关系，不要急着否定自己。'],
 attention:['这一步要你来决定。想清楚再点。','轮到你了，我可不能替你作主。','有问题就问，逞强可不加分。','先回去看看需要你回答什么。'],
 completed:['做完了？那就大方夸自己一句。','这次表现不错。别因此就熬夜哦。','先把成果收好，再去喝点水。','今天的努力，也算数的。'],
 uncertain:['暂时没新消息，先别急着下结论。','看不到进展，不等于什么也没发生。','数据还没到。猜答案可不算认真。','先等等信号，再决定下一步。'],
 generic:['点头像可以换一句；拖动仍能调整位置。','稍微休息一下，再继续吧。','工作状态以日志信号为准。']
};
export function dialogueGroup(key){if(['waiting_user','waiting_approval'].includes(key))return 'attention';if(key==='completed')return 'completed';if(['quiet','unknown','incomplete','disconnected','unavailable','retrying'].includes(key))return 'uncertain';if(['processing','reasoning','responding','tool'].includes(key))return 'working';return 'idle';}
// Original desktop lines. Character research and attribution: ROXY_SOURCES.md.
export const roxyDialoguePools={
 idle:['今天的练习，从一个小目标开始吧。','先把笔记准备好。基础可不能省略。','不用那么拘谨，我会陪你练习的。','旅途很长，按自己的步调前进就好。','在发呆？那就先想好下一步。','点心先放旁边，完成这一步再吃。'],
 working:['复杂的术式，也要一步一步理清。','先别急着下结论，观察还没结束。','耐心一点，认真思考也需要时间。','不用一直盯着数字，先照顾好自己。','这一步还在进行，我们再等一等。','我也会遇到难题。慢慢解开就好。'],
 attention:['这一步需要你回答，请回去看一看。','先确认请求内容，再作决定吧。','有不明白的地方，就先问清楚。','轮到你了。我在这里等你的选择。'],
 completed:['完成了。今天的练习很扎实呢。','做得不错，记得把成果整理好。','这一课结束了。休息一下再出发吧。','认真积累的每一步，都有意义。','嗯，这次可以安心吃点心了。'],
 uncertain:['暂时没有新记录，先保留判断吧。','信号还没更新，不能当作已经结束。','先检查记录，再决定下一步。','没有数据的地方，我也不能猜哦。']
};
export function chooseDialogue(key,previous='',character='mai',random=Math.random()){
 const builtin=['mai','roxy'].includes(character),group=builtin?dialogueGroup(key):'generic';
 const pool=(character==='roxy'?roxyDialoguePools:dialoguePools)[group];
 const choices=pool.filter(text=>text!==previous);const safe=Number.isFinite(random)?Math.min(.999999,Math.max(0,random)):0;
 return {text:choices[Math.floor(safe*choices.length)],kind:builtin?'同人互动':'本地互动',group};
}
