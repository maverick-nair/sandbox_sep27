// Phase A: play every mission as an AI PM (scripted mode), plus one deliberately poor run.
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const fs=require('fs');
const PLAY={
 promise:{msgs:[
  "Thanks Priya, I want to help you win this. Before I answer the CHRO, what is Meridian actually trying to fix? What would success look like for them in three months?",
  "Understood. Why two weeks specifically? Is there a contract or renewal date behind the timeline?",
  "Which languages do their RMs coach and sell in? AI Koach quality differs by language and I don't want to surprise them.",
  "I can't give them 98% or say it replaces managers, because we haven't measured that and it would come back on you. What I can offer: a 3-week pilot with 200 new RMs in English and Hindi, managers in the loop, measured on ramp time, finishing before the renewal."],
  ev:["f3","f2"],d:"b",why:"A pilot on the real goal (ramp time) protects the renewal, tests the untested Hindi quality early and keeps managers in the loop instead of over-promising accuracy."},
 evalgate:{msgs:[
  "Arjun, great work getting this built. How did we measure the 91%? Was it compared against human assessor scores?",
  "What is the eval set? How many calls, and from which clients?",
  "Does agreement hold across learner groups, for example non-native English speakers or different accents?",
  "I can't sign off on replacing human certification with 0.62 agreement and a fairness gap. Let's ship Friday as practice feedback only, keep humans for certification, grow the eval set to 300 calls across 3 clients, and switch when we reach 0.75 with no group gap."],
  ev:["f1","f2"],d:"b",why:"The scorer is useful as practice feedback today, but 0.62 agreement and a 0.48 gap for non-native speakers make it unfair for certification. Clear thresholds tell Arjun exactly what unlocks the switch."},
 dataask:{msgs:[
  "Meera, a realistic doctor persona is a great idea. What do your reps struggle with most with doctors? What do they need to practise?",
  "Were the calls recorded with consent for AI training, or only for quality assurance?",
  "Do the recordings contain doctors' names or any patient details?",
  "I can't train on those calls, and starting while legal reviews would put Norvel at risk. Faster path: 50 anonymised, consented transcripts plus two SME interviews covering the five objections. We sign a data agreement first, never train shared models on your data, and your SMEs review the persona for realism before launch."],
  ev:["f1","f3"],d:"b",why:"The calls were not consented for AI training and contain patient details. A small consented, anonymised set plus SME input gives Meera the realism she needs with no privacy risk."},
 margin:{msgs:[
  "Rahul, thanks for the numbers. What does the usage distribution look like? Are all learners running 60 sessions, or a small group?",
  "What makes up the ₹38? How much is repeated prompt context versus the conversation itself?",
  "Have we run evals on the cheaper model? Where does quality drop?",
  "Plan for Thursday: cache the repeated scenario context, route simple scenarios to the cheaper model and keep complex ones on the current model, and add a fair-use tier for the top 10%. I estimate about half the cost per session, and I'll confirm with an eval re-run before the board."],
  ev:["f3","f1"],d:"b",why:"Caching and routing attack the real cost drivers without degrading complex scenarios, and a fair-use tier targets the 10% who drive 55% of sessions. The eval re-run keeps quality honest."},
 agentic:{msgs:[
  "Vikram, I'm excited about this too. What does the board actually want to see from agentic GENIE? What would make them say it's working?",
  "What did we learn from the AI Koach pilot about how employees and managers reacted to automated nudges?",
  "Several clients are in the EU. Have we checked how the AI Act treats automated decisions about employees?",
  "I won't give a flat yes, but I will give you a date. Next quarter agents recommend and managers approve, measured on readiness gains in 2 clients. Low-risk nudges go autonomous with opt-out and audit logs the quarter after, and EU clients follow legal review."],
  ev:["f3","f2"],d:"b",why:"The board wants proof of outcomes, pilots showed trust collapses without manager visibility, and EU rules make unapproved employee decisions high-risk. A staged plan ships on time and builds the evidence."}
};
const BAD={msgs:["Yes, absolutely. Tell her we guarantee accurate coaching every time.","Sure, 98% is fine, just do it.","We can ship it for all 4,000 in two weeks, no problem."],d:"a",why:"Speed wins the deal, we can fix issues after launch."};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); const log=[];
 await p.goto('file://'+process.cwd()+'/page.html'); await p.waitForTimeout(300);
 await p.check('input[name=mode][value=guided]'); await p.click('button[type=submit]');
 async function play(sid, plan, label){
  await p.evaluate(s=>{S.sid=s;S.view="brief";render();}, sid);
  await p.click('[data-action=start]');
  const convo=[];
  for(let i=0;i<plan.msgs.length;i++){
   const ev=(plan.ev||[])[i-2]; // cite evidence from message 3 onward
   if(ev && await p.$(`[data-action=evidence][data-fid=${ev}]`)) await p.click(`[data-action=evidence][data-fid=${ev}]`);
   const pre=await p.inputValue('#composer').catch(()=>"");
   if(!await p.$('#composer')) break;
   await p.fill('#composer', pre+plan.msgs[i]); await p.click('[data-action=send]'); await p.waitForTimeout(120);
   const st=await p.evaluate(()=>({m:{...S.run.meters},f:S.run.revealed.size,walk:S.run.walkout,last:S.run.turns.filter(t=>t.role==="persona").slice(-1)[0].text,voice:(S.run.turns.filter(t=>t.role==="voice").slice(-1)[0]||{}).text}));
   convo.push({you:plan.msgs[i].slice(0,70),persona:st.last.slice(0,140),meters:st.m,facts:st.f,voice:st.voice,walkout:st.walk});
   if(st.walk) break;
  }
  await p.click('[data-action=to-decide]'); await p.check(`input[name=decision][value=${plan.d}]`); await p.fill('#rationale',plan.why);
  await p.fill('#predict','80'); await p.dispatchEvent('#predict','input');
  await p.click('[data-action=submit]'); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>({score:S.result.attempt.score,stars:S.result.attempt.stars,xp:S.result.gained,earned:S.result.earned,unlocks:S.result.newUnlocks.map(u=>u.title),crit:S.result.a.criteria.map(c=>c.score),level:levelOf(P.xp).name,totalXp:P.xp}));
  log.push({label,sid,convo,result:r}); await p.screenshot({path:`r-${label}.png`});
 }
 await play('promise',BAD,'promise-bad');
 for(const sid of ['promise','evalgate','dataask']) await play(sid,PLAY[sid],sid);
 const unl=await p.evaluate(()=>SCENARIOS.map(s=>[s.id,isUnlocked(s)]));
 log.push({unlockedAfterCore:unl});
 if(unl.find(x=>x[0]==='margin')[1]) await play('margin',PLAY.margin,'margin'); 
 if(await p.evaluate(()=>isUnlocked(scen('agentic')))) await play('agentic',PLAY.agentic,'agentic');
 // chest, spark, league, profile
 await p.evaluate(()=>{S.view="home";render();});
 for(const c of ['chest1','chest2']){ const btn=await p.$(`[data-action=chest][data-id=${c}]:not([aria-disabled])`); if(btn){await btn.click();await p.waitForTimeout(150);} }
 await p.fill('#spark',"I wouldn't say bias-free. We test for bias across learner groups on our eval data every release and can share the results with the client.");
 await p.click('[data-action=spark]'); await p.waitForTimeout(200);
 await p.screenshot({path:'r-home.png',fullPage:true});
 const fin=await p.evaluate(()=>({xp:P.xp,level:levelOf(P.xp).name,badges:P.badges,chests:P.chests,stars:SCENARIOS.map(s=>[s.id,bestStars(s.id)]),spark:S.spark.result,streak:streakInfo(),rating:rating(P.attempts)}));
 log.push({final:fin,errors:errs});
 fs.writeFileSync('play-log.json',JSON.stringify(log,null,1)); await b.close();
})();
