import { Injectable } from '@nestjs/common';

export interface CalendarEventDetails {
  title: string;
  description: string;
  start: Date;
  durationMinutes: number;
  meetingLink?: string | null;
  organizerEmail?: string;
  candidateName?: string;
  locationNotes?: string;
}

@Injectable()
export class CalendarService {
  /**
   * Generates a standard formatted Google Meet room URL (e.g. https://meet.google.com/abc-defg-hij).
   */
  generateGoogleMeetLink(seed?: string): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';

    let code1 = '';
    let code2 = '';
    let code3 = '';

    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      const n = Math.abs(hash);
      const getLetter = (index: number) => {
        return chars[(n + index * 17 + index * index * 7) % chars.length];
      };
      for (let i = 0; i < 3; i++) code1 += getLetter(i);
      for (let i = 3; i < 7; i++) code2 += getLetter(i);
      for (let i = 7; i < 10; i++) code3 += getLetter(i);
    } else {
      for (let i = 0; i < 3; i++) code1 += chars.charAt(Math.floor(Math.random() * chars.length));
      for (let i = 0; i < 4; i++) code2 += chars.charAt(Math.floor(Math.random() * chars.length));
      for (let i = 0; i < 3; i++) code3 += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `https://meet.google.com/${code1}-${code2}-${code3}`;
  }

  /**
   * Generates a 1-click Google Calendar web event creation URL.
   */
  generateGoogleCalendarWebLink(details: CalendarEventDetails): string {
    const startIso = details.start
      .toISOString()
      .replace(/-|:|\.\d+/g, '');
    const end = new Date(details.start.getTime() + details.durationMinutes * 60 * 1000);
    const endIso = end.toISOString().replace(/-|:|\.\d+/g, '');

    const locationText = details.meetingLink || details.locationNotes || 'Office / In-Person';

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: details.title,
      dates: `${startIso}/${endIso}`,
      details: `${details.description}${
        details.meetingLink ? `\n\nGoogle Meet: ${details.meetingLink}` : '\n\nMode: Offline / In-Person'
      }${details.locationNotes ? `\nLocation Notes: ${details.locationNotes}` : ''}`,
      location: locationText,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /**
   * Generates a universal iCalendar (.ics) invite string.
   */
  generateIcsInvite(details: CalendarEventDetails, uid?: string): string {
    const startIso = details.start
      .toISOString()
      .replace(/-|:|\.\d+/g, '');
    const end = new Date(details.start.getTime() + details.durationMinutes * 60 * 1000);
    const endIso = end.toISOString().replace(/-|:|\.\d+/g, '');
    const eventUid = uid || `interview_${Date.now()}@ats`;
    const locationText = details.meetingLink || details.locationNotes || 'Office / In-Person';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ATS Platform//Interview Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${eventUid}`,
      `DTSTAMP:${new Date().toISOString().replace(/-|:|\.\d+/g, '')}`,
      `DTSTART:${startIso}`,
      `DTEND:${endIso}`,
      `SUMMARY:${details.title}`,
      `DESCRIPTION:${details.description.replace(/\n/g, '\\n')}`,
      `LOCATION:${locationText}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}
