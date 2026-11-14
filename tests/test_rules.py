import json
import shutil
import threading
import unittest
from contextlib import closing
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

import server


class ExistingRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = server.ROOT / 'data' / f'test-{uuid4().hex}'
        scratch.mkdir(parents=True)
        cls.addClassCleanup(shutil.rmtree, scratch)
        original = server.DB_PATH
        cls.addClassCleanup(setattr, server, 'DB_PATH', original)
        cls.addClassCleanup(server.SESSIONS.clear)
        server.DB_PATH = scratch / 'test.db'
        server.initialize()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.addClassCleanup(cls.http.server_close)
        worker = threading.Thread(target=cls.http.serve_forever, daemon=True)
        worker.start()
        cls.addClassCleanup(worker.join)
        cls.addClassCleanup(cls.http.shutdown)

    def client(self, username=None):
        opener = build_opener(HTTPCookieProcessor(CookieJar()))

        def call(method, path, payload=None):
            data = json.dumps(payload).encode() if payload is not None else None
            request = Request(
                f'http://127.0.0.1:{self.http.server_port}/api{path}', data=data,
                headers={'Content-Type': 'application/json'}, method=method,
            )
            try:
                with opener.open(request) as response:
                    return response.status, json.load(response)
            except HTTPError as error:
                with error:
                    return error.code, json.load(error)

        if username:
            code, _ = call('POST', '/login', {'username': username, 'password': 'Demo123456'})
            self.assertEqual(code, 200)
        return call

    def test_existing_registration_locks_eligibility(self):
        admin = self.client('admin')
        student = self.client('zhou')
        _, result = admin('GET', '/competitions')
        c = result['competitions'][0]
        path = f'/competitions/{c["id"]}'
        with closing(server.connect()) as db, db:
            captain = db.execute("SELECT id FROM users WHERE username='zhou'").fetchone()[0]
            team = db.execute(
                'INSERT INTO teams(competition_id,captain_id,name) VALUES(?,?,?)',
                (c['id'], captain, '测试队'),
            ).lastrowid
            db.execute(
                'INSERT INTO registrations(team_id,contact_name,contact_phone) VALUES(?,?,?)',
                (team, '测试联系人', '13800000000'),
            )
        self.assertIs(admin('GET', path)[1]['competition']['eligibility_locked'], True)
        self.assertNotIn('eligibility_locked', student('GET', path)[1]['competition'])
        code, result = admin('PUT', path, {'deadline': '2099-12-31', 'description': '不能部分写入'})
        self.assertEqual(code, 400)
        self.assertIn('已有报名', result['error'])
        self.assertEqual(admin('GET', path)[1]['competition']['description'], c['description'])
        code, result = admin('PUT', path, {'description': '可修改的简介'})
        self.assertEqual(code, 200)
        self.assertEqual(result['competition']['deadline'], c['deadline'])

    def test_password_change_revokes_other_sessions(self):
        guest = self.client()
        code, result = guest('POST', '/register', {
            'username': 'session_test', 'password': 'LocalPass1', 'name': '测试学生', 'role': 'admin',
        })
        self.assertEqual(code, 200)
        self.assertEqual(result['user']['role'], 'student')
        other = self.client()
        self.assertEqual(other('POST', '/login', {'username': 'session_test', 'password': 'LocalPass1'})[0], 200)
        self.assertEqual(guest('PUT', '/password', {'old_password': 'LocalPass1', 'new_password': 'LocalPass2'})[0], 200)
        self.assertEqual(guest('GET', '/me')[1]['user']['username'], 'session_test')
        self.assertIsNone(other('GET', '/me')[1]['user'])
