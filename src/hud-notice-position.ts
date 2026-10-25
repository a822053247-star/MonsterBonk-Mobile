/** Position important prompts below the actual timer panel, including extra HUD rows. */
export function positionHudNotice(root:HTMLElement,below?:string){
  const clock=document.querySelector<HTMLElement>('#hud .run-status')?.getBoundingClientRect();
  let top=clock&&clock.height>0?clock.bottom+28:112;
  if(below){
    const other=document.querySelector<HTMLElement>(below);
    if(other&&!other.hidden){const rect=other.getBoundingClientRect();if(rect.height>0)top=Math.max(top,rect.bottom+24);}
  }
  const value=`${Math.ceil(top)}px`;
  if(root.style.top!==value)root.style.top=value;
}

export function guideBelowRunStatus(x:number,y:number,width:number,height:number){
  const clock=document.querySelector<HTMLElement>('#hud .run-status')?.getBoundingClientRect();
  if(clock&&clock.height>0&&x+width/2>clock.left&&x-width/2<clock.right)
    return Math.max(y,clock.bottom+20+height/2);
  return y;
}
