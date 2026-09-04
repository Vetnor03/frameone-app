from pathlib import Path

PORTAL = Path('frame/src/device/ProvisioningPortal.cpp').read_text()


def test_selecting_wifi_collapses_picker_and_reveals_password_step():
    assert "onchange='selectNetwork(this)'" in PORTAL
    select = PORTAL[PORTAL.index('function selectNetwork'):PORTAL.index('function changeNetwork')]
    assert "document.getElementById('networkPicker').hidden=true" in select
    assert "document.getElementById('selectedNetwork').hidden=false" in select
    assert "document.getElementById('passwordSection').hidden=false" in select
    assert "document.getElementById('selectedSsid').textContent=input.value" in select


def test_connect_submit_uses_dedicated_connecting_page_not_wifi_form_again():
    assert 'static String connectingPage(const String& ssid)' in PORTAL
    save = PORTAL[PORTAL.index('static void handleSave'):PORTAL.index('static void handleNotFound')]
    assert 'server.send(200, "text/html", connectingPage(ssid));' in save
    assert 'htmlPage("Saved.' not in save
    assert 'Connecting your frame' in PORTAL
