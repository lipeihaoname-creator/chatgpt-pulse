// Original Chinese fan dialogue. Sources and distinction from quotations are
// documented in docs/MUSIC_REACTIVE.md. No song, lyrics, or mood recognition.
const entry=(moods,...lines)=>({moods,lines});
export const musicExchanges={
 mai:[
  entry(['curious','bashful','relax'],'你是在认真听声音，还是终于愿意休息了？','不必马上回答，先把肩膀放松。','这一会儿，可以不用赶时间。'),
  entry(['shy','pout','bashful'],'别盯着我看，我只是稍微动了一下。','你也跟着点头了吧？','那就当作谁也没发现。'),
  entry(['relax','curious','smile'],'让声音在旁边待一会儿，也不错。','不用给每段休息安排一个目的。','安静坐着也算好好度过。'),
  entry(['proud','shy','bashful'],'演员偶尔也会跟着节奏走神。','不过这里没有镜头，不用那么认真看我。','……笑一下可以，不许起哄。'),
  entry(['curious','nod','relax'],'要不要暂时把计划放在一边？','等休息够了再拿回来。','我不会偷偷给你增加任务。'),
  entry(['bashful','shy','smile'],'你刚才是不是在等我跟着动？','被你看见，好像也没什么大不了的。','不过别把休息变成观察报告。'),
  entry(['relax','curious','bashful'],'这一小段时间，先交给耳朵吧。','眼睛也可以看看远处。','回来时，我还在这里。'),
  entry(['pout','nod','smile'],'都开始听声音了，还在偷偷想工作？','认真休息，也要稍微专心一点。','好，这回就不继续念你了。'),
  entry(['curious','shy','bashful'],'如果我不说话，你会注意到我在轻轻晃吗？','现在倒是看得很认真。','好了，注意力分给你自己一点。'),
  entry(['relax','smile','nod'],'不用急着切换到下一件事。','给现在留一点余地。','休息好了，再慢慢出发。'),
  entry(['bashful','proud','shy'],'今天就允许自己稍微悠闲一点。','不是每一分钟都需要交出成果。','这句建议，我也会一起遵守。'),
  entry(['glance-left','curious','relax'],'声音在继续，我们就先待一会儿。','你不说话也没关系。','有人在旁边，并不一定要很热闹。')
 ],
 roxy:[
  entry(['curious','nod','bashful'],'声音有起伏的时候，身体也会想轻轻动一下呢。','不必每一下都跟上，放松就好。','现在不是课堂，不用数拍子。'),
  entry(['proud','curious','bashful'],'如果把练习安排得像节奏一样有间隔……','啊，休息时间又在想课程了。','这一会儿，就让老师也休息吧。'),
  entry(['shy','bashful','smile'],'我刚才是不是轻轻点头了？','被你发现，稍微有一点不好意思。','你也可以放松，不用端正坐好。'),
  entry(['relax','nod','smile'],'旅途中有声音陪着，脚步好像会轻一点。','不过现在不赶路，坐着就很好。','清水和休息，都请别忘了。'),
  entry(['curious','pout','bashful'],'我刚才数到哪里了？','算了，这又不是考试。','听一会儿，不记笔记也可以。'),
  entry(['bashful','shy','nod'],'老师偶尔跟着晃一下，也没关系吧？','请不要突然看得那么认真。','嗯，这个样子就不用写进笔记了。'),
  entry(['relax','curious','smile'],'现在先不用思考复杂的术式。','让注意力慢慢松开就好。','下一次练习，等休息够了再开始。'),
  entry(['proud','bashful','relax'],'练习需要控制，休息有时需要放手。','这两件事都值得学一学。','我也还在练习后面那一件呢。'),
  entry(['glance-right','curious','bashful'],'如果书页也能自己跟着翻动……','不对，那样反而找不到刚才的一行。','还是让书签安静待着吧。'),
  entry(['shy','smile','nod'],'不用每次都等我先开口。','想安静听一会儿，也很好。','我会在旁边陪着你的。'),
  entry(['curious','bashful','relax'],'刚才又差一点把拍子当成练习次数了。','老师的习惯，偶尔也该放下呢。','现在只要舒服地坐着就够了。'),
  entry(['relax','nod','smile'],'长途旅行也需要这样的小停留。','不用证明自己一直在前进。','歇好了，再决定下一站吧。')
 ]
};
