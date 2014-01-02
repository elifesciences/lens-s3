eLife lens deployment
=======

Deployment of eLife lens on Amazon S3 and CloudFront. 

See [https://github.com/elifesciences/lens] for the lens code.

# Updating

Currently requires some manual steps:

* Overwrite the ``dist`` folder contents with the ``dist`` from the lens repo
* Copy ``dist/data/about/`` contents to ``about/data/about``
* Update HTML code if required: ``about/index.html``, ``lens_article/index.html``

Note: eLife bot also contains lens template files that may require updating when a new lens version is deployed. These are used to generate directories named ``/xxxxx/`` automatically when new articles are published.

# Deploying

Copy files to the S3 bucket, replacing existing files. Create a CloudFront invalidation for the new files (optional).
