"""Regression: Windows GBK must not decode UTF-8 Git output in reader threads."""
import shutil
import subprocess
import sys

import pytest

from coworker.environment import _git, environment_context
from coworker.projects import project_key
from coworker.session_facts import _git_remotes
from coworker.tools.git import git_tools
from coworker.server.manager import _git_branch
from coworker.connectors.integration_tools import _run_git


@pytest.fixture
def repository(tmp_path, monkeypatch):
    if not shutil.which('git'):
        pytest.skip('git is not installed')
    repo = tmp_path / '中文项目'
    repo.mkdir()
    def git(*args, **kwargs):
        return subprocess.run(['git', '-C', str(repo), *args], check=True,
                              capture_output=True, encoding='utf-8', **kwargs)
    git('init', '-b', '功能分支')
    git('config', 'user.name', '开发者')
    git('config', 'user.email', 'test@example.invalid')
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-F', '-',
        input='修复会话 🚀 ®\n')
    git('remote', 'add', 'origin', 'https://example.invalid/中文项目.git')
    # Even a user-configured log encoding must not override our decoding contract.
    git('config', 'i18n.logOutputEncoding', 'ISO-8859-1')
    monkeypatch.setattr(subprocess, '_text_encoding', lambda: 'gbk')
    return repo


def test_code_session_context_preserves_unicode_under_gbk(repository):
    context = environment_context(repository)
    assert '功能分支' in context
    assert '修复会话 🚀 ®' in context
    assert 'Git status: clean' in context
    assert project_key(repository) == str(repository.resolve())
    assert _git_branch(repository) == '功能分支'
    assert _git_remotes(repository) == (('origin', 'https://example.invalid/中文项目.git'),)


def test_git_tools_preserve_unicode_under_gbk(repository):
    result = git_tools(str(repository))[0]()
    assert result['commits'][0]['subject'] == '修复会话 🚀 ®'
    assert result['commits'][0]['author'] == '开发者'
    output, error = _run_git(['log', '-1', '--format=%s'], cwd=repository)
    assert not error
    assert output == '修复会话 🚀 ®'


def test_invalid_output_bytes_do_not_crash_reader_threads(tmp_path, monkeypatch):
    run = subprocess.run
    def invalid_bytes(_cmd, **kwargs):
        return run([sys.executable, '-c',
                    "import sys; sys.stdout.buffer.write(b'bad \\xff'); sys.stderr.buffer.write(b'bad \\xfe')"],
                   **kwargs)
    monkeypatch.setattr(subprocess, 'run', invalid_bytes)
    assert _git(tmp_path, 'log') == 'bad \ufffd'


def test_missing_repo_and_timeout_remain_best_effort(tmp_path, monkeypatch):
    assert 'Git: not a git repository' in environment_context(tmp_path)
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired('git', 5)
    monkeypatch.setattr(subprocess, 'run', timeout)
    assert 'Git: not a git repository' in environment_context(tmp_path)
