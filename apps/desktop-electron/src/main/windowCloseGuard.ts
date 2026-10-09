export interface CloseEventLike {
  preventDefault(): void;
}

export interface WindowCloseGuard {
  requestAppQuit(): void;
  cancelClose(): void;
  confirmClose(): boolean;
  handleClose(event: CloseEventLike): boolean;
}

export function createWindowCloseGuard(requestCloseConfirmation: () => void): WindowCloseGuard {
  let closeConfirmed = false;
  let confirmationPending = false;
  let appQuitRequested = false;

  return {
    requestAppQuit() {
      appQuitRequested = true;
    },
    cancelClose() {
      confirmationPending = false;
      appQuitRequested = false;
    },
    confirmClose() {
      const resumeAppQuit = appQuitRequested;
      closeConfirmed = true;
      confirmationPending = false;
      appQuitRequested = false;
      return resumeAppQuit;
    },
    handleClose(event: CloseEventLike): boolean {
      if (closeConfirmed) {
        return true;
      }

      event.preventDefault();
      if (!confirmationPending) {
        confirmationPending = true;
        requestCloseConfirmation();
      }
      return false;
    }
  };
}
