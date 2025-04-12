async logout() {
  try {
    // Clear user data
    localStorage.clear();
    await this.afAuth.signOut();
    
    // Use navigateForward instead of navigateRoot to preserve history
    this.navCtrl.navigateForward('/login');
  } catch (error) {
    console.error('Logout error:', error);
  }
}