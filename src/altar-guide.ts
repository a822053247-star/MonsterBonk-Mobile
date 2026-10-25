import { WorldEventGuide } from './world-event-guide';

/** Lead to the stairs on the south side rather than into the platform wall. */
export class AltarGuide extends WorldEventGuide {
  constructor(){super({title:'元素祭坛',offsetZ:5,nearText:'沿台阶登台'});}
}
