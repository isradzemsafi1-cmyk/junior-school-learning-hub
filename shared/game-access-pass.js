/* Shared KES 10 / 12-hour pass for MATHQUEST+ and EduGames World.
   Access is granted only from the verified public.entitlements record created
   by the existing Safaricom-verified M-Pesa callback. */
(function(){
  const PRODUCT_ID="games_12h_pass";
  const PRICE_KES=10;
  const DURATION_HOURS=12;
  const SUPABASE_URL="https://hqbqhnhgrgfxpedjzmnm.supabase.co";
  const SUPABASE_KEY="sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  let client=null, session=null, expiry=null, checking=false, pollTimer=null;

  function addStyles(){
    if(document.getElementById("jslh-game-pass-styles"))return;
    const s=document.createElement("style");s.id="jslh-game-pass-styles";
    s.textContent=`
      main.game-access-locked>*:not(#jslhGamePassGate){display:none!important}
      #jslhGamePassGate{max-width:780px;margin:26px auto;padding:clamp(22px,5vw,42px);border-radius:26px;color:#fff;background:radial-gradient(circle at 90% 10%,#7650d8 0,transparent 30%),linear-gradient(135deg,#0b1747,#1d3b9b 65%,#4a278e);box-shadow:0 22px 60px #10245f35;border:1px solid #ffffff25}
      #jslhGamePassGate h1{color:#fff;font-size:clamp(27px,5vw,40px);line-height:1.08;margin:10px 0}
      #jslhGamePassGate p{color:#e3eaff;line-height:1.6}
      #jslhGamePassGate .pass-price{font-size:clamp(34px,7vw,54px);font-weight:1000;color:#ffd45b;line-height:1.1}
      #jslhGamePassGate .pass-badges{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
      #jslhGamePassGate .pass-badges span{padding:8px 12px;border:1px solid #ffffff38;background:#ffffff14;border-radius:30px;font-size:13px;font-weight:850}
      #jslhGamePassGate label{display:block;color:#fff;font-weight:850;margin:12px 0 5px}
      #jslhGamePassGate input{width:100%;padding:14px;border-radius:12px;border:1px solid #cbd5f3;font:inherit;font-size:16px;color:#17234f;background:#fff}
      #jslhGamePassGate button{border:0;border-radius:13px;padding:14px 18px;font:inherit;font-weight:950;cursor:pointer}
      #jslhGamePassPay{width:100%;margin-top:12px;background:linear-gradient(90deg,#ffd45b,#ff9b43);color:#24204b}
      #jslhGamePassCheck{background:#ffffff1c;color:#fff;border:1px solid #ffffff50}
      #jslhGamePassStatus{min-height:26px;margin:13px 0;color:#fff;font-weight:750}
      #jslhGamePassGate .pass-note{font-size:12px;color:#cbd8ff}
      @media(max-width:600px){#jslhGamePassGate{margin:14px 0;padding:22px 17px}}
    `;
    document.head.appendChild(s);
  }
  function makeGate(){
    addStyles();
    const main=document.querySelector("main");
    if(!main)throw new Error("Game access container is missing.");
    main.classList.add("game-access-locked");
    let gate=document.getElementById("jslhGamePassGate");
    if(gate)return gate;
    gate=document.createElement("section");gate.id="jslhGamePassGate";
    gate.innerHTML=`
      <div style="font-size:38px">🎮 🌍 ⭐</div>
      <span style="display:inline-block;padding:5px 11px;border-radius:30px;background:#ffd45b;color:#25204d;font-size:12px;font-weight:950;letter-spacing:.06em">ONE PASS · TWO GAMES</span>
      <h1>Unlock your gaming adventure!</h1>
      <p>One small payment gives you access to <b>MATHQUEST+</b> and <b>EduGames World</b>. Play either game, switch between them and continue your learning adventure during your pass.</p>
      <div class="pass-price">KES 10 <span style="font-size:16px;color:#fff;font-weight:800">/ 12 hours</span></div>
      <div class="pass-badges"><span>🎮 MATHQUEST+</span><span>🌍 EduGames World</span><span>⏱️ 12-hour access</span><span>📱 M-Pesa STK Push</span></div>
      <label for="jslhGamePassPhone">M-Pesa phone number</label>
      <input id="jslhGamePassPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX or 2547XXXXXXXX" maxlength="16">
      <button id="jslhGamePassPay" type="button">Pay KES 10 and unlock both games</button>
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:9px"><button id="jslhGamePassCheck" type="button">I've paid — check access</button><a href="/access/" style="color:#fff;font-weight:800">Switch account</a></div>
      <div id="jslhGamePassStatus" role="status" aria-live="polite">Sign in and complete payment to unlock both games for 12 hours.</div>
      <p class="pass-note">Access begins after Safaricom confirms successful payment. Cancelled, failed or unverified payments do not unlock the games. Never share your M-Pesa PIN.</p>
    `;
    main.insertBefore(gate,main.firstChild);
    gate.querySelector("#jslhGamePassPay").addEventListener("click",startPayment);
    gate.querySelector("#jslhGamePassCheck").addEventListener("click",()=>checkAccess(true));
    return gate;
  }
  function status(message){const el=document.getElementById("jslhGamePassStatus");if(el)el.textContent=message;}
  async function getSession(){
    if(!window.supabase?.createClient)throw new Error("The secure sign-in service did not load. Refresh and try again.");
    client=client||window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const result=await client.auth.getSession();
    session=result.data?.session||null;
    return session;
  }
  async function checkAccess(manual=false){
    if(checking)return false;
    checking=true;
    try{
      if(!session)await getSession();
      if(!session?.user?.id)return false;
      const now=new Date().toISOString();
      const {data,error}=await client.from("entitlements").select("expires_at,active")
        .eq("user_id",session.user.id).eq("product_id",PRODUCT_ID).eq("active",true)
        .gt("expires_at",now).order("expires_at",{ascending:false}).limit(1);
      if(error)throw error;
      const row=data?.[0];
      if(row?.expires_at&&new Date(row.expires_at)>new Date()){
        expiry=new Date(row.expires_at);
        unlock();
        return true;
      }
      if(manual)status("No active 12-hour gaming pass was found yet. If you have just paid, wait a moment and check again.");
      return false;
    }catch(e){
      console.error("Game pass check failed:",e);
      if(manual)status("Could not verify access right now. Check your connection and try again.");
      return false;
    }finally{checking=false;}
  }
  function unlock(){
    const main=document.querySelector("main");main?.classList.remove("game-access-locked");
    const gate=document.getElementById("jslhGamePassGate");if(gate)gate.style.display="none";
    const label=document.getElementById("accountStatus");
    if(label)label.textContent="Gaming pass active · until "+expiry.toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit"});
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
    window.dispatchEvent(new CustomEvent("jslh-game-pass-active",{detail:{expiresAt:expiry?.toISOString()}}));
  }
  async function startPayment(){
    const button=document.getElementById("jslhGamePassPay");
    const phone=document.getElementById("jslhGamePassPhone").value.trim();
    if(!phone){status("Enter the M-Pesa phone number to receive the payment prompt.");return;}
    try{
      if(!session)await getSession();
      if(!session?.access_token){location.replace("/access/?next="+encodeURIComponent(location.pathname));return;}
      button.disabled=true;button.textContent="Sending M-Pesa request…";
      status("Please wait while we send a secure STK Push to your phone.");
      const response=await fetch("/.netlify/functions/mpesa-stk",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({product_id:PRODUCT_ID,phone})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.success)throw new Error(result.message||"Could not start the M-Pesa payment. Please try again.");
      status("M-Pesa prompt sent. Enter your M-Pesa PIN on your phone. We are waiting for Safaricom to confirm payment…");
      let attempts=0;
      if(pollTimer)clearInterval(pollTimer);
      pollTimer=setInterval(async()=>{
        attempts++;
        const active=await checkAccess(false);
        if(active){status("Payment confirmed! Both games are now unlocked for 12 hours.");return;}
        if(attempts>=60){clearInterval(pollTimer);pollTimer=null;status("We haven't received confirmation yet. If you completed payment, tap “I've paid — check access”. Do not pay again unless the first request failed.");}
      },3000);
    }catch(e){status(e.message||"Payment could not be started.");}
    finally{button.disabled=false;button.textContent="Pay KES 10 and unlock both games";}
  }
  async function requireAccess(){
    makeGate();
    try{
      await getSession();
      if(!session?.user?.id){location.replace("/access/?next="+encodeURIComponent(location.pathname));return false;}
      const ok=await checkAccess(false);
      if(ok)return true;
      status("Your 12-hour gaming pass is not active. Pay KES 10 once to unlock both games.");
      return false;
    }catch(e){status(e.message||"Please sign in to continue.");return false;}
  }
  window.JSLHGameAccess={require:requireAccess,check:checkAccess};
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&session)checkAccess(false);});
})();
