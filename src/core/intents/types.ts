export type Intent =
  | 'tell_time'
  | 'tell_date'
  | 'battery_level'
  | 'media_play'
  | 'media_pause'
  | 'media_next'
  | 'volume_up'
  | 'volume_down'
  | 'repeat_last'
  | 'call_contact'
  | 'sos_alert'
  | 'unknown';

export type ParsedCommand = {
  intent: Intent;
  /** Contact name for call_contact, otherwise null. */
  target: string | null;
  /** Where the result came from. */
  source: 'rule' | 'llm' | 'none';
};
