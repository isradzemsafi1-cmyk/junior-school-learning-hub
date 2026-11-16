/* Junior School Learning Hub privacy-conscious site activity tracker.
   Records anonymous visitor sessions and resource interactions; never stores IP addresses. */
(() => {
  const endpoint="/.netlify/functions/track-activity";
  const visitorKey="jslh_visitor_id";
  const uuid=()=>crypto.randomUUID();
  let visitorId;
  try {
    visitorId=sessionStorage.getItem(visitorKey)||localStorage.getItem(visitorKey);
    if(!visitorId){visitorId=uuid();localStorage.setItem(visitorKey,visitorId);}
  } catch { visitorId=uuid(); }
  const supabase=window.supabase;
  const client=window.jslhSupabase||window.supabaseClient||window.sb||null;
  const send=async(eventType,extra={})=>{
    try{
      let token=null;
      if(client?.auth?.getSession){const {data}=await client.auth.getSession();token=data?.session?.access_token||null;}
      const payload={
        visitor_id:visitorId,event_type:eventType,page_path:location.pathname,
        resource_id:extra.resource_id||null,resource_title:extra.resource_title||null,
        resource_category:extra.resource_category||null,
        access_type:extra.access_type||"unknown",grade:extra.grade||null,
        metadata:extra.metadata||{}
      };
      const headers={"Content-Type":"application/json"};
      if(token)headers.Authorization="Bearer "+token;
      const body=JSON.stringify(payload);
      if(navigator.sendBeacon&&!token){navigator.sendBeacon(endpoint,new Blob([body],{type:"application/json"}));}
      else{fetch(endpoint,{method:"POST",headers,body,keepalive:true,credentials:"same-origin"}).catch(()=>{});}
    }catch(_){}
  };
  window.JSLHActivity={track:(type,details)=>send(type,details||{})};
  send("page_view",{metadata:{title:document.title,referrer:document.referrer?new URL(document.referrer).origin:""}});
  document.addEventListener("click",event=>{
    const target=event.target.closest("a,button,[data-resource-id],[data-track-event]");
    if(!target)return;
    const label=(target.getAttribute("aria-label")||target.textContent||target.title||"").trim().replace(/\\s+/g," ").slice(0,180);
    const href=target.getAttribute("href")||"";
    const resourceId=target.dataset.resourceId||target.dataset.resource||null;
    const isDownload=target.hasAttribute("download")||/\\.pdf(?:$|[?#])/i.test(href);
    const isResource=!!resourceId||target.dataset.resourceType||/resource|notes|revision|library|download|premium|quiz/i.test(label+" "+href);
    const type=target.dataset.trackEvent|| (isDownload?"resource_download":isResource?"resource_open":null);
    if(type)send(type,{
      resource_id:resourceId,resource_title:target.dataset.resourceTitle||label,
      resource_category:target.dataset.resourceCategory||target.dataset.resourceType||null,
      access_type:target.dataset.accessType||(/premium|paid/i.test(label+" "+href)?"premium":/free/i.test(label+" "+href)?"free":"unknown"),
      grade:target.dataset.grade||null,metadata:{href:href.slice(0,500),label}
    });
  },true);
  document.addEventListener("submit",event=>{
    const form=event.target;
    if(form.matches("#registrationForm,[data-track-registration]"))send("registration_started");
    if(form.matches("#loginForm,[data-track-login]"))send("login_started");
  },true);
})();
