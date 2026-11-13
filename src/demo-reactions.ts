/** Engine-lifetime synthetic reactions only, not inspected-target or write authority. */
import { randomBytes } from 'node:crypto';
import { reactionLabel, type ReactionCommand, type ReactionGroup, type ReactionBatch } from './reaction-contracts.js';

export class DemoReactions {
  private readonly groups = new Map<string,ReactionGroup[]>();
  async reaction(command:ReactionCommand):Promise<unknown> {
    const key = JSON.stringify([command.roomId,command.messageId]), groups = this.groups.get(key) ?? [];
    if (command.action === 'summary') {
      const snapshot = { roomId:command.roomId,messageId:command.messageId,observedAt:Date.now(),partial:false,unknown:false,
        groups:structuredClone(groups) };
      if (!command.details) return snapshot;
      for (const group of snapshot.groups) delete group.own;
      return {snapshot,actors:groups.map(g=>({reaction:g.reaction,personId:'demo-self',name:'You (demo)'})),partial:true};
    }
    const reaction = command.reaction!;
    const current = groups.find(g=>g.reaction === reaction);
    if (command.action === 'add') {
      if (!current) groups.push({ reaction,label:reactionLabel(reaction),count:1,own:randomBytes(16).toString('hex') });
    } else {
      if (!current?.own || current.own !== command.own) return { status:'failed' };
      groups.splice(groups.indexOf(current),1);
    }
    this.groups.set(key,groups); return { status:'changed' };
  }
  async reactions(batch:ReactionBatch):Promise<unknown> {
    const items = await Promise.all(batch.messageIds.map(messageId=>this.reaction({ roomId:batch.roomId,messageId,action:'summary' })));
    return { roomId:batch.roomId,items };
  }
}
