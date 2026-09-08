export interface AgentTimelineEntry {
  item: { type: string; [key: string]: any };
  timestamp: string;
  seqStart: number;
  turnId?: string;
}

