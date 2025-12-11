class DisplayTask {
  private _blocked: boolean;
  private readonly taskHandler: Function;
  private readonly callback: (() => void) | undefined;

  constructor(taskHandler: Function, blocked: boolean, callback?: () => void) {
    this._blocked = blocked;
    this.taskHandler = taskHandler;
    this.callback = callback;
  }

  public unblock() {
    if (this._blocked) {
      this._blocked = false;
      this.callback?.();
    }
  }

  public execute() {
    this.taskHandler?.();
  }


  get blocked(): boolean {
    return this._blocked;
  }

  set blocked(value: boolean) {
    this._blocked = value;
  }
}

export default DisplayTask;