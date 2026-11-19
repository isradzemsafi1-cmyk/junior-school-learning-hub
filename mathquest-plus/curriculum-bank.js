/* MATHQUEST+ curriculum expansion: varied, worked mathematics questions for every grade/topic/difficulty selection. */
(()=>{
 if(typeof Q==="undefined") return;
 const $=id=>document.getElementById(id);
 const rand=(n)=>Math.floor(Math.random()*n);
 const pick=a=>a[rand(a.length)];
 const levels=["Foundation","Developing","Proficient","Advanced"];
 const topicsByGrade={
  1:["Number","Operations","Patterns","Geometry","Measurement","Data"],
  2:["Number","Operations","Patterns","Geometry","Measurement","Data"],
  3:["Number","Operations","Fractions","Patterns","Geometry","Measurement","Data"],
  4:["Number","Operations","Fractions","Decimals","Geometry","Measurement","Data"],
  5:["Number","Operations","Fractions","Decimals","Percentages","Geometry","Measurement","Data"],
  6:["Number","Operations","Fractions","Decimals","Percentages","Ratio","Geometry","Measurement","Data"],
  7:["Number","Integers","Fractions","Decimals","Percentages","Ratio","Algebra","Geometry","Measurement","Data","Probability","Graphs"],
  8:["Number","Integers","Fractions","Decimals","Percentages","Ratio","Algebra","Geometry","Measurement","Data","Probability","Graphs","Sequences"],
  9:["Number","Integers","Fractions","Decimals","Percentages","Ratio","Algebra","Geometry","Measurement","Data","Probability","Graphs","Sequences","Trigonometry"],
  10:["Number","Algebra","Geometry","Mensuration","Measurement","Graphs","Probability","Statistics","Sequences","Trigonometry","Financial mathematics"],
  11:["Number","Algebra","Geometry","Mensuration","Graphs","Probability","Statistics","Sequences","Trigonometry","Functions","Calculus","Financial mathematics"],
  12:["Number","Algebra","Geometry","Mensuration","Graphs","Probability","Statistics","Sequences","Trigonometry","Functions","Calculus","Financial mathematics","Vectors and matrices"]
 };
 const formulas={
  Number:"Place value; order of operations (BODMAS); factors × multiples = product; HCF and LCM.",
  Operations:"Addition and subtraction are inverse operations; multiplication is repeated addition; division is the inverse of multiplication.",
  Patterns:"Look for what changes from one term to the next. Arithmetic pattern: add/subtract a constant difference. Multiplicative pattern: multiply/divide by a constant factor. Square numbers: n².",
  Fractions:"Fraction of a quantity = numerator/denominator × quantity. For a/b + c/b = (a+c)/b. Equivalent fractions: multiply or divide numerator and denominator by the same non-zero number.",
  Decimals:"Align decimal points when adding/subtracting. To multiply by 10, 100 or 1,000, move digits left; to divide, move digits right.",
  Percentages:"Percentage = (part ÷ whole) × 100%. Amount = rate/100 × whole. New value after increase = original × (1 + rate/100).",
  Ratio:"Equivalent ratios are obtained by multiplying/dividing every term by the same non-zero number. Share = (part ÷ total parts) × amount.",
  Algebra:"Distributive law: a(b+c)=ab+ac. Solve equations by performing the same operation on both sides. Difference of squares: a²−b²=(a−b)(a+b).",
  Geometry:"Angles on a straight line = 180°; around a point = 360°; triangle interior angles = 180°; quadrilateral interior angles = 360°; regular polygon exterior angle = 360°/n.",
  Measurement:"1 km = 1,000 m; 1 m = 100 cm; 1 cm = 10 mm; 1 kg = 1,000 g; 1 L = 1,000 mL. Speed = distance ÷ time.",
  Data:"Mean = sum of values ÷ number of values. Median = middle value after sorting. Mode = most frequent value. Range = maximum − minimum.",
  Probability:"Probability = favourable outcomes ÷ total equally likely outcomes. P(not A)=1−P(A).",
  Graphs:"Gradient m = (y₂−y₁)/(x₂−x₁). Straight-line form: y=mx+c. x-intercept occurs when y=0; y-intercept occurs when x=0.",
  Sequences:"Arithmetic sequence: nth term aₙ=a+(n−1)d; common difference d = next term − previous term.",
  Trigonometry:"SOH–CAH–TOA: sinθ=opposite/hypotenuse; cosθ=adjacent/hypotenuse; tanθ=opposite/adjacent. Pythagoras: a²+b²=c².",
  Mensuration:"Rectangle A=lw, P=2(l+w); triangle A=½bh; parallelogram A=bh; circle A=πr², C=2πr; prism/cylinder volume = cross-sectional area × length/height.",
  Statistics:"Mean = Σx/n. For grouped data, estimated mean = Σfx/Σf. Standard deviation measures spread around the mean.",
  Functions:"For f(x), substitute the input for x and simplify. Composite functions: (f∘g)(x)=f(g(x)).",
  Calculus:"Power rule: d(xⁿ)/dx=nxⁿ⁻¹. Integral power rule: ∫xⁿdx=xⁿ⁺¹/(n+1)+C, n≠−1.",
  "Financial mathematics":"Simple interest I=PRT/100; amount A=P+I. Discount = rate/100 × marked price. Profit = selling price − cost price.",
  "Vectors and matrices":"Vector magnitude |a|=√(x²+y²). Matrix addition is entry-by-entry. For [[a,b],[c,d]], determinant = ad−bc."
 };
 function fmt(n){return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);}
 function mk(g,t,l,q,ans,ex,hint,unit=""){
  const correct=String(ans)+(unit||"");
  let vals=[correct];
  const numeric=String(ans).trim()!==""&&Number.isFinite(Number(ans));
  let candidates=[];
  if(numeric){const v=Number(ans);candidates=[v+1,v-1,v+2,v-2,v*2,v/2,v+5,Math.max(0,v-5)];}
  else if(t==="Geometry"){candidates=["Triangle","Quadrilateral","Pentagon","Hexagon","Octagon","Circle","Heptagon"];}
  else if(t==="Fractions"){const p=String(ans).split("/");candidates=[(Number(p[0])+1)+"/"+p[1],p[0]+"/"+(Number(p[1])+1),Math.max(1,Number(p[0])-1)+"/"+p[1],p[0]+"/"+Math.max(2,Number(p[1])-1)];}
  else if(t==="Ratio"){const p=String(ans).split(":");candidates=[(Number(p[0])+1)+":"+p[1],p[0]+":"+(Number(p[1])+1),(Number(p[0])*2)+":"+p[1],p[0]+":"+(Number(p[1])*2)];}
  else if(t==="Algebra"){candidates=[String(ans).replace("+","−"),String(ans).replace("x","x²"),String(ans).replace(/\d+/,m=>String(Number(m)+1)),"x + "+String(ans)];}
  else if(t==="Calculus"){candidates=[String(ans).replace("x^","x^"+""),String(ans).replace(/^\d+/,"1"),"0",""+String(ans)+" + C"];}
  else {candidates=["None of the other options","Not enough information","0"];}
  for(const v of candidates){const s=String(v)+(unit||"");if(s!==correct&&!vals.includes(s)&&vals.length<4)vals.push(s);}
  while(vals.length<4) vals.push("Option "+String.fromCharCode(65+vals.length));
  const options=vals.slice(0,4).sort(()=>Math.random()-.5);
  return {id:"bank-"+g+"-"+t.toLowerCase().replace(/[^a-z]/g,"")+"-"+Math.random().toString(36).slice(2),grade:g,topic:t,level:l,q,a:options,correct:options.indexOf(correct),explain:ex,hint};
 }
 function question(g,t,l,variant=0){
  const d=levels.indexOf(l),s=g+d;
  let a,b,n,ans,q,ex,h;
  switch(t){
   case "Number": case "Operations": case "Integers":
    a=rand(20*s+10)+1;b=rand(12*s+8)+1;
    if(t==="Integers"||g>=7){a=rand(30)+5;b=rand(25)+1;if(rand(2)){a=-a;}}
    if(d===0){ans=a+b;q="Calculate "+a+" + "+b+".";ex=a+" + "+b+" = "+ans+".";h="Add the values, keeping track of place value and signs.";}
    else if(d===1){ans=a-b;q="Evaluate "+a+" − "+b+".";ex=a+" − "+b+" = "+ans+".";h="Subtract carefully; use a number line if helpful.";}
    else if(d===2){ans=a*b;q="Calculate "+a+" × "+b+".";ex=a+" × "+b+" = "+ans+".";h="Use multiplication facts or split one factor.";}
    else {b=rand(9)+2;ans=a%b===0?a/b:a+b;q=a%b===0?"Evaluate "+a+" ÷ "+b+".":"A quantity of "+a+" is increased by "+b+". Find the result.";ex=a%b===0?a+" ÷ "+b+" = "+ans+".":a+" + "+b+" = "+ans+".";h="Identify the operation and show each step.";}
    break;
   case "Patterns":
    a=rand(12)+1;b=rand(6)+2;n=rand(6)+4;
    if(d===0){ans=a+b;q="Complete the pattern: "+a+", "+(a+b)+", "+(a+2*b)+", __.";ex="The pattern increases by "+b+" each time, so the next term is "+ans+".";h="Find the common difference between consecutive terms.";}
    else if(d===1){ans=a+(n-1)*b;q="A pattern starts "+a+", "+(a+b)+", "+(a+2*b)+", ... Find the "+n+"th term.";ex="Nth term = first term + (n−1)×difference = "+a+"+("+n+"−1)×"+b+" = "+ans+".";h="Find the first term and common difference.";}
    else if(d===2){ans=n*n;q="Find the "+n+"th square number.";ex=n+"² = "+ans+".";h="Square numbers are 1, 4, 9, 16, 25, ...";}
    else{ans=Math.pow(2,n);q="A bacteria culture doubles every hour. Starting with 1 bacterium, how many are there after "+n+" hours?";ex="There are 1×2^"+n+" = "+ans+" bacteria.";h="Repeated doubling is a power of 2.";}
    break;
   case "Fractions":
    n=pick([2,3,4,5,6,8,10]);a=rand(n-1)+1;b=n*pick([2,3,4,5,6]);
    if(d===0){ans=a+"/"+n;q="What fraction of the whole is represented by "+a+" equal parts out of "+n+"?";ex=a+" of "+n+" equal parts gives "+a+"/"+n+".";h="Write the number of selected parts over the total parts.";}
    else if(d===1){ans=(a*2)+"/"+(n*2);q="Find a fraction equivalent to "+a+"/"+n+" by doubling numerator and denominator.";ex="("+a+"×2)/("+n+"×2) = "+ans+".";h="Multiply top and bottom by the same number.";}
    else if(d===2){let whole=n*pick([3,4,5,6]);ans=whole/n*a;q="Find "+a+"/"+n+" of "+whole+".";ex=whole+" ÷ "+n+" × "+a+" = "+ans+".";h="Divide by the denominator, then multiply by the numerator.";}
    else {let x=pick([1,2,3]),y=pick([1,2,3]);ans=(x+y)+"/"+n;q="Calculate "+x+"/"+n+" + "+y+"/"+n+".";ex="Add numerators: ("+x+"+"+y+")/"+n+" = "+ans+".";h="The denominators are equal; add the numerators.";}
    break;
   case "Decimals":
    a=rand(900)/100+1;b=rand(400)/100+0.1;
    if(d<2){ans=Math.round((a+b)*100)/100;q="Calculate "+fmt(a)+" + "+fmt(b)+".";ex=fmt(a)+" + "+fmt(b)+" = "+fmt(ans)+".";h="Line up the decimal points.";}
    else if(d===2){ans=Math.round((a*b)*100)/100;q="Calculate "+fmt(a)+" × "+fmt(b)+".";ex=fmt(a)+" × "+fmt(b)+" = "+fmt(ans)+".";h="Multiply, then place the decimal point.";}
    else {ans=Math.round((a+b)*100)/100;q="A learner records "+fmt(a)+" m and then "+fmt(b)+" m. Find the total length.";ex=fmt(a)+" + "+fmt(b)+" = "+fmt(ans)+" m.";h="Add the measurements using aligned decimal points.";}
    break;
   case "Percentages":
    a=pick([10,20,25,30,40,50,60,75]);b=pick([80,100,120,160,200,240,320,400]);ans=b*a/100;
    q="Find "+a+"% of "+b+".";ex=a+"% × "+b+" = ("+a+"/100) × "+b+" = "+ans+".";h="Convert the percentage to a fraction over 100, then multiply.";
    break;
   case "Ratio":
    a=pick([2,3,4,5,6]);b=pick([3,4,5,6,7]);n=pick([2,3,4]);ans=(a*n)+":"+(b*n);
    if(d===0){q="A mixture uses "+a+" cups of juice for every "+b+" cups of water. State the ratio of juice to water.";ans=a+":"+b;ex="The ratio is "+a+":"+b+".";h="Keep the quantities in the order asked.";}
    else {q="Which ratio is equivalent to "+a+":"+b+"?";ex="Multiply both terms by "+n+": "+a+"×"+n+":"+b+"×"+n+" = "+ans+".";h="Multiply both terms by the same number.";}
    break;
   case "Algebra":
    a=rand(9)+2;b=rand(15)+1;n=rand(12)+1;ans=n;
    if(d===0){q="If x + "+b+" = "+(n+b)+", find x.";ex="Subtract "+b+" from both sides: x = "+(n+b)+" − "+b+" = "+n+".";h="Undo addition by subtracting the constant.";}
    else if(d===1){q="Solve "+a+"x = "+(a*n)+".";ex="Divide both sides by "+a+": x = "+(a*n)+"/"+a+" = "+n+".";h="Undo multiplication by dividing both sides.";}
    else if(d===2){q="Solve "+a+"x + "+b+" = "+(a*n+b)+".";ex="Subtract "+b+", then divide by "+a+": x = "+n+".";h="Undo addition first, then multiplication.";}
    else {q="Expand "+a+"(x + "+b+").";ans=a+"x + "+(a*b);ex="Multiply each term by "+a+": "+a+"×x + "+a+"×"+b+" = "+ans+".";h="Use the distributive law a(b+c)=ab+ac.";}
    break;
   case "Geometry":
    if(variant%5===0&&d===0){n=pick([3,4,5,6,8]);ans=n===3?"Triangle":n===4?"Quadrilateral":n===5?"Pentagon":n===6?"Hexagon":"Octagon";q="What is the name of a polygon with "+n+" sides?";ex="A polygon with "+n+" sides is a "+ans+".";h="Recall the names of polygons by their number of sides.";}
    else if(variant%5===1&&g<=6){a=pick([2,3,4,5]);ans=a*2;q="How many lines of symmetry does a square have?";ans=4;ex="A square has four lines of symmetry: two diagonals and two lines through the midpoints of opposite sides.";h="Imagine folding the square into matching halves.";}
    else if(variant%5===2&&g>=7){a=pick([35,40,50,60]);b=pick([30,45,55,65]);ans=180-a-b;q="Two angles of a triangle are "+a+"° and "+b+"°. Calculate the third angle.";ex="180° − "+a+"° − "+b+"° = "+ans+"°.";h="The interior angles of a triangle add up to 180°.";}
    else if(variant%5===3&&g>=8){a=rand(8)+3;b=rand(8)+3;ans=a*b;q="A parallelogram has base "+a+" cm and perpendicular height "+b+" cm. Find its area.";ex="Area = base × perpendicular height = "+a+" × "+b+" = "+ans+" cm².";h="Use A = bh; use the perpendicular height, not the sloping side.";}
    else if(variant%5===4&&g>=9){a=pick([3,5,6,8]);b=pick([4,12,8,15]);ans=Math.sqrt(a*a+b*b);q="A right-angled triangle has perpendicular sides "+a+" cm and "+b+" cm. Find the hypotenuse to 2 decimal places.";ans=fmt(ans);ex="c = √(a²+b²) = √("+a+"²+"+b+"²) = "+ans+" cm.";h="Apply Pythagoras' theorem: square both shorter sides, add, then take the square root.";}
    else if(d===1){a=pick([35,40,50,60,70]);b=pick([30,45,55,65]);ans=180-a-b;q="A triangle has angles "+a+"° and "+b+"°. Find the third angle.";ex="Angles in a triangle sum to 180°: 180° − "+a+"° − "+b+"° = "+ans+"°.";h="The three interior angles add up to 180°.";}
    else if(d===2){a=rand(12)+4;b=rand(10)+3;ans=2*(a+b);q="Find the perimeter of a rectangle of length "+a+" cm and width "+b+" cm.";ex="P=2(l+w)=2("+a+"+"+b+")="+ans+" cm.";h="Add length and width, then multiply by two.";}
    else {n=pick([5,6,8,10,12]);ans=360/n;q="Find each exterior angle of a regular "+n+"-sided polygon.";ex="Exterior angle = 360° ÷ "+n+" = "+ans+"°.";h="The exterior angles of any polygon add up to 360°.";}
    break;
   case "Measurement": case "Mensuration":
    a=rand(15)+5;b=rand(12)+3;
    if(d===0){ans=a*100;q="Convert "+a+" m to centimetres.";ex=a+" × 100 = "+ans+" cm.";h="There are 100 centimetres in one metre.";}
    else if(d===1){ans=a*1000;q="Convert "+a+" kg to grams.";ex=a+" × 1,000 = "+ans+" g.";h="One kilogram equals 1,000 grams.";}
    else if(d===2){ans=a*b;q="Find the area of a rectangle measuring "+a+" cm by "+b+" cm.";ex="A=l×w="+a+"×"+b+"="+ans+" cm².";h="Area of a rectangle is length multiplied by width.";}
    else {ans=2*(a+b);q="A rectangular field is "+a+" m long and "+b+" m wide. Find its perimeter.";ex="P=2(l+w)=2("+a+"+"+b+")="+ans+" m.";h="Perimeter is the total distance around the boundary.";}
    break;
   case "Data": case "Statistics":
    {let vals=[rand(8)+2,rand(8)+2,rand(8)+2,rand(8)+2,rand(8)+2].sort((x,y)=>x-y);
    if(d===0){ans=vals[2];q="Find the median of "+vals.join(", ")+ ".";ex="The values are ordered; the middle value is "+ans+".";h="Arrange the data in order and select the middle value.";}
    else if(d===1){ans=vals.reduce((x,y)=>x+y,0);ans=ans/vals.length;q="Find the mean of "+vals.join(", ")+ ".";ex="Mean = ("+vals.join("+")+") ÷ "+vals.length+" = "+fmt(ans)+".";h="Add all values and divide by the number of values.";}
    else if(d===2){let f=pick([2,3,4,5]);ans=f;q="In a data set, the value "+f+" occurs more often than any other value. What is it called?";ans="Mode";ex="The most frequently occurring value is the mode.";h="Think of the most common value.";}
    else {ans=vals[4]-vals[0];q="Find the range of "+vals.join(", ")+ ".";ex="Range = largest − smallest = "+vals[4]+" − "+vals[0]+" = "+ans+".";h="Subtract the smallest value from the largest.";}
    }
    break;
   case "Probability":
    a=pick([2,3,4,5]);b=pick([2,3,4,5]);ans="1/"+(a+b);q="A bag contains "+a+" red counters and "+b+" blue counters. One counter is selected at random. What is the probability of selecting a red counter?";ans=a+"/"+(a+b);ex="Favourable outcomes ÷ total outcomes = "+a+"/"+(a+b)+".";h="Count the red counters, then divide by the total counters." ;break;
   case "Graphs":
    a=rand(6)+1;b=rand(5)+1;n=rand(5)+1;ans=(b+n*a);
    if(d<2){q="For the straight line y = "+a+"x + "+b+", find y when x = "+n+".";ex="y="+a+"×"+n+"+"+b+"="+ans+".";h="Substitute the given x-value into the equation.";}
    else {let x1=rand(4),x2=x1+pick([1,2,3]),y1=rand(5),m=pick([1,2,3,4]);ans=m;q="Find the gradient between ("+x1+","+y1+") and ("+x2+","+(y1+m*(x2-x1))+").";ex="m=(y₂−y₁)/(x₂−x₁) = "+(m*(x2-x1))+"/"+(x2-x1)+" = "+m+".";h="Gradient is change in y divided by change in x.";}
    break;
   case "Sequences":
    a=rand(8)+1;b=rand(6)+2;n=rand(7)+4;ans=a+(n-1)*b;q="An arithmetic sequence begins "+a+", "+(a+b)+", "+(a+2*b)+", ... Find its "+n+"th term.";ex="aₙ=a+(n−1)d="+a+"+("+n+"−1)×"+b+"="+ans+".";h="Find the common difference and use the nth-term rule." ;break;
   case "Trigonometry":
    {const triples=[[3,4,5],[5,12,13],[8,15,17]];let tr=pick(triples);if(d<2){ans=tr[0];q="A right-angled triangle has hypotenuse "+tr[2]+" cm and opposite side "+tr[0]+" cm. What is sin θ as a decimal?";ans=fmt(tr[0]/tr[2]);ex="sinθ=opposite/hypotenuse="+tr[0]+"/"+tr[2]+"="+ans+".";h="Use SOH: sine = opposite ÷ hypotenuse.";}else{ans=tr[1];q="A right triangle has sides "+tr.join(", ")+" cm. If the hypotenuse is "+tr[2]+" cm and one leg is "+tr[0]+" cm, find the other leg.";ex="a²+b²=c², so other leg = √("+tr[2]+"²−"+tr[0]+"²) = "+tr[1]+" cm.";h="Apply Pythagoras' theorem.";}break;}
   case "Functions":
    a=rand(5)+2;b=rand(9)+1;n=rand(6)+2;ans=a*n+b;q="If f(x) = "+a+"x + "+b+", find f("+n+").";ex="f("+n+")="+a+"×"+n+"+"+b+"="+ans+".";h="Replace x with the input value and simplify.";break;
   case "Calculus":
    a=pick([2,3,4,5]);n=pick([2,3,4,5]);ans=a*n;q="Differentiate y = "+a+"x^"+n+" with respect to x.";ans=a*n+"x^"+(n-1);ex="Using d(xⁿ)/dx=nxⁿ⁻¹: dy/dx = "+a+"×"+n+"x^"+(n-1)+" = "+ans+".";h="Bring the power down as a multiplier and reduce the power by one.";break;
   case "Financial mathematics":
    a=pick([1000,2000,3000,4000,5000]);b=pick([5,10,12,15]);n=pick([1,2,3]);ans=a*b*n/100;q="Calculate the simple interest on KSh "+a+" at "+b+"% per annum for "+n+" year(s).";ex="I=PRT/100="+a+"×"+b+"×"+n+"/100 = KSh "+ans+".";h="Use I = PRT/100; time is in years.";break;
   case "Vectors and matrices":
    a=rand(5)+1;b=rand(5)+1;n=rand(5)+1;ans=a*n+b;q="Given vectors u=(" + a + "," + b + ") and v=(0,"+n+"), find the first component of u+v.";ans=a;ex="Add corresponding components: ("+a+"+0, "+b+"+"+n+") = ("+a+","+(b+n)+"). First component = "+a+".";h="Add matching coordinates component by component.";break;
   default: ans=12;q="Calculate 6 × 2.";ex="6 × 2 = 12.";h="Use multiplication facts.";
  }
  return mk(g,t,l,q,ans,ex,h);
 }
 const seen=new Set(Q.map(x=>[x.grade,x.topic,x.level,x.q].join("|")));
 let added=0;
 for(let g=1;g<=12;g++) for(const t of topicsByGrade[g]) for(const l of levels) for(let i=0;i<5;i++){
  const item=question(g,t,l,i),key=[item.grade,item.topic,item.level,item.q].join("|");
  if(!seen.has(key)){Q.push(item);seen.add(key);added++;}
 }
 const topic=$("topic"),old=topic.value;
 const allTopics=[...new Set(Q.map(x=>x.topic))].sort();
 topic.innerHTML='<option value="all">Surprise me — all topics</option>'+allTopics.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t+'</option>').join("");
 if(allTopics.includes(old))topic.value=old;
 const count=$("available");
 if(count)count.textContent=Q.length+"+ questions across Grades 1–12, all listed topics and all four challenge levels.";
 const panel=document.createElement("section");
 panel.className="panel";
 panel.innerHTML='<h2>📘 Formula &amp; Strategy Locker</h2><p class="muted">Quick revision before you enter the arena. Select a topic to see key rules and formulas.</p><label for="formulaTopic">Choose a formula topic</label><select id="formulaTopic"></select><div id="formulaText" class="feedback" style="white-space:pre-wrap"></div>';
 const game=$("game");if(game&&game.parentNode)game.parentNode.insertBefore(panel,game.nextSibling);
 const ft=$("formulaTopic"),fx=$("formulaText");
 ft.innerHTML=allTopics.map(t=>'<option value="'+t.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'">'+t+'</option>').join("");
 function showFormula(){fx.textContent=formulas[ft.value]||"Use the method and definitions taught for this topic. Show every step and include units where needed.";}
 ft.addEventListener("change",showFormula);showFormula();
 const grade=$("grade"),missionTopic=$("topic");
 function updateAvailability(){const g=Number(grade.value),t=missionTopic.value,l=$("level").value;const n=Q.filter(x=>x.grade===g&&(t==="all"||x.topic===t)&&(l==="all"||x.level===l)).length;if(count)count.textContent=n+" questions available for this selection.";}
 grade.addEventListener("change",updateAvailability);missionTopic.addEventListener("change",updateAvailability);$("level").addEventListener("change",updateAvailability);updateAvailability();
 const style=document.createElement("style");style.textContent=".arena-invite{border:1px solid #e7c76d}.formula-locker{border-left:5px solid #ffc23d}#formulaText{font-weight:650;line-height:1.8}";document.head.append(style);panel.classList.add("formula-locker");
 console.info("MATHQUEST+ bank added",added,"questions; total",Q.length);
})();