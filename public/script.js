function navigateToNew() {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = `/new?token=${token}`;
    } else {
        window.location.href = '/login';
    }
}
