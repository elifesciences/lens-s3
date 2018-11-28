eLife lens deployment
=======

Deployment of eLife lens on Amazon S3 and CloudFront. 

See [https://github.com/elifesciences/lens] for the lens code.

# Updating Lens

Currently requires some manual steps:

* Overwrite the ``dist`` folder contents with the ``dist`` from the lens release (the bundled files). Lens releases are here [https://github.com/elifesciences/lens/releases]

Note: eLife bot also contains lens template files that may require updating when a new lens version is deployed. These are used to generate directories named ``/xxxxx/`` automatically when new articles are published. ``LensArticlePublish`` workflows will need to be re-run for all articles using new templates. Lens template is in [https://github.com/elifesciences/elife-bot/tree/master/template].

# Deploying

* Copy files to the S3 bucket, replacing existing files.
* **Note**: .json files may require a MIME / content type of ``application/json`` to be set instead of the default application/octet-stream used by S3, especially for ``manual/content.json`` for lens to load the data natively.

## Optional

Create a CloudFront invalidation for the new files (optional).
