import DisplayTask from "./DisplayTask";

class DisplayFrame {
  private tasks: DisplayTask[];
  private readonly callback: (() => void) | undefined;

  constructor(callback: () => void, tasks: DisplayTask[]) {
    this.callback = callback;
    this.tasks = tasks;
  }


  public isReady() {
    // Search for blocked tasks
    for (let i = 0; i < this.tasks.length; i++) {
      if (this.tasks[i].blocked) {
        return false;
      }
    }

    // If no blocked tasks, the frame is ready
    return true;
  }

  public flush() {
    // Draw all pending tasks.
    for (let i = 0; i < this.tasks.length; i++) {
      this.tasks[i].execute();
    }
    // Call callback
    this.callback?.();
  }
}

export default DisplayFrame;