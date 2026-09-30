"""Create private API TLS certificates. Requires: python -m pip install cryptography.

Run from itc-srv-10. Existing certificates are never overwritten.
"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

folder = Path('certs')
folder.mkdir(exist_ok=True)
names = ['ca.crt', 'ca.key', 'server.crt', 'server.key']
if any((folder / name).exists() for name in names):
    raise SystemExit('Certificates already exist; no files changed.')
now = datetime.now(timezone.utc)
ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'PitStop Attendance Private CA')])
ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
      .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
      .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=730))
      .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
      .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
      .sign(ca_key, hashes.SHA256()))
key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, '85.112.75.82')])
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(ca_name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address('85.112.75.82'))]), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.KeyUsage(True, False, True, False, False, False, False, False, False), critical=True)
        .sign(ca_key, hashes.SHA256()))
for filename, value in [('ca.crt', ca.public_bytes(serialization.Encoding.PEM)),
                        ('server.crt', cert.public_bytes(serialization.Encoding.PEM)),
                        ('ca.key', ca_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())),
                        ('server.key', key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))]:
    with (folder / filename).open('xb') as output:
        output.write(value)
print('Created certificates. Upload only ca.crt to the Vercel CA environment variable.')
print('Keep both .key files private, restrict their Windows ACLs, and secure the CA key offline.')
print('Server certificate expires:', cert.not_valid_after_utc.isoformat())
