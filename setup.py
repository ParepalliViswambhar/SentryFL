"""
SentryFL: Differentially Private Federated Learning for Time-Series Anomaly Detection

A privacy-preserving, communication-efficient federated learning framework for
distributed security sensing environments.
"""

from setuptools import setup, find_packages
import os

# Read the README file for long description
def read_long_description():
    here = os.path.abspath(os.path.dirname(__file__))
    readme_path = os.path.join(here, 'README.md')
    if os.path.exists(readme_path):
        with open(readme_path, 'r', encoding='utf-8') as f:
            return f.read()
    return __doc__

# Read requirements from requirements.txt
def read_requirements():
    here = os.path.abspath(os.path.dirname(__file__))
    req_path = os.path.join(here, 'requirements.txt')
    requirements = []
    if os.path.exists(req_path):
        with open(req_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if line and not line.startswith('#'):
                    requirements.append(line)
    return requirements

setup(
    name='sentryfl',
    version='0.1.0',
    author='SentryFL Development Team',
    author_email='sentryfl@example.com',
    description='Differentially Private Federated Learning for Time-Series Anomaly Detection',
    long_description=read_long_description(),
    long_description_content_type='text/markdown',
    url='https://github.com/yourusername/sentryfl',
    packages=find_packages(exclude=['tests', 'tests.*', 'examples', 'examples.*']),
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Intended Audience :: Science/Research',
        'Intended Audience :: Developers',
        'Topic :: Scientific/Engineering :: Artificial Intelligence',
        'Topic :: Security',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
    ],
    python_requires='>=3.8',
    install_requires=read_requirements(),
    extras_require={
        'dev': [
            'pytest>=7.4.0',
            'pytest-cov>=4.1.0',
            'black>=23.0.0',
            'flake8>=6.0.0',
            'mypy>=1.0.0',
            'isort>=5.12.0',
        ],
        'docs': [
            'sphinx>=6.0.0',
            'sphinx-rtd-theme>=1.2.0',
        ],
    },
    entry_points={
        'console_scripts': [
            'sentryfl=sentryfl.cli:main',
        ],
    },
    include_package_data=True,
    zip_safe=False,
    keywords='federated-learning differential-privacy anomaly-detection time-series security',
    project_urls={
        'Bug Reports': 'https://github.com/yourusername/sentryfl/issues',
        'Source': 'https://github.com/yourusername/sentryfl',
        'Documentation': 'https://sentryfl.readthedocs.io',
    },
)
