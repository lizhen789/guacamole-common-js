/**
 * An arbitrary event, emitted by a {@link EventTarget}.
 */
class Event {
  /**
   * The unique name of this event type.
   */
  type: string;

  /**
   * An arbitrary timestamp in milliseconds, indicating this event's
   * position in time relative to other events.
   */
  timestamp: number;

  private _returnValue: boolean = true;

  /**
   * Prevents the default action of all DOM events related to this event.
   */
  preventDefault?: () => void;
  /**
   * Stops propagation of all DOM events related to this event.
   */
  stopPropagation?: () => void;

  /**
   * @constructor
   * @param type The unique name of this event type.
   */
  constructor(type: string) {
    this.type = type;
    this.timestamp = new Date().getTime();
  }

  /**
   * Returns the number of milliseconds elapsed since this event was created.
   *
   * @returns The number of milliseconds elapsed since this event was created.
   */
  getAge(): number {
    return new Date().getTime() - this.timestamp;
  }

  /**
   * Requests that the legacy event handler associated with this event be
   * invoked on the given event target.
   *
   * @param eventTarget The {@link EventTarget} that emitted this event.
   */
  invokeLegacyHandler(eventTarget: EventTarget): void {
    // Do nothing by default
    console.log("Invoking legacy handler for event:", eventTarget)
  }

  get returnValue(): boolean {
    return this._returnValue;
  }

  set returnValue(value: boolean) {
    this._returnValue = value;
  }
}

/**
 * A {@link Event} that may relate to one or more DOM events.
 */
class DOMEvent extends Event {
  /**
   * The DOM events that are related to this event, if any.
   */
  events: Event[];

  /**
   * @constructor
   * @param type The unique name of this event type.
   * @param events The DOM events that are related to this event, if any.
   */
  constructor(type: string, events: Event | Event[] = []) {
    super(type);

    // Normalize events to an array
    this.events = Array.isArray(events) ? events : [events];
    this.preventDefault = () => {
      for (const event of this.events) {
        if (event.preventDefault) {
          event.preventDefault();
          event.returnValue = false;
        }
      }
    };
    this.stopPropagation = () => {
      for (const event of this.events) {
        if (event.stopPropagation) {
          event.stopPropagation();
        }
      }
    };
  }

  /**
   * Cancels all DOM events that are related to this event.
   */
  cancelEvent(event: Event): void {
    if (event.stopPropagation) {
      event.stopPropagation();
    }
    if (event.preventDefault) event.preventDefault();
    event.returnValue = false;
  }
}

type EventListener = (event: Event) => void;

class EventTarget implements EventTarget {
  private listeners: Map<string, Set<EventListener>>;

  constructor() {
    this.listeners = new Map();
  }

  on(type: string, listener: EventListener): void {
    let relevantListeners = this.listeners.get(type);

    if (!relevantListeners) {
      relevantListeners = new Set();
      this.listeners.set(type, relevantListeners);
    }
    relevantListeners.add(listener);
  }

  onEach(types: string[], listener: EventListener): void {
    types.forEach((type) => {
      this.on(type, listener);
    })
  }

  dispatch(event: Event): void {
    // Invoke any relevant legacy handler for the event
    event.invokeLegacyHandler(this);

    // Invoke all registered listeners
    var relevantListeners = this.listeners.get(event.type)
    if (relevantListeners) {
      relevantListeners.forEach((listener) => {
        listener(event);
      })
    }
  }

  off(type: string, listener: EventListener): boolean {
    let relevantListeners = this.listeners.get(type);
    if (!relevantListeners) {
      return false;
    }
    return relevantListeners.delete(listener);
  }

  offEach(types: string[], listener: EventListener): boolean {
    let changed = false;
    types.forEach((type) => {
      changed ||= this.off(type, listener);
    })
    return changed
  }
}

// 导出核心类和接口供其他模块使用
export {Event, DOMEvent, EventTarget};
export default Event;