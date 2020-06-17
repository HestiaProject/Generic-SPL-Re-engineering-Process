@extends('projects.app')

@section('content')
<div class="row">
    <div class="col-lg-12 margin-tb">
        <div class="pull-left">
            <h2>Activity Details</h2>
        </div>

    </div>
</div>

@if ($errors->any())
<div class="alert alert-danger">
    There were some problems with your input.<br><br>
    <ul>
        @foreach ($errors->all() as $error)
        <li>{{ $error }}</li>
        @endforeach
    </ul>
</div>
@endif

<form action="{{ route('projects.scoping_process.activities.update', ['project'=>$project->id,'scoping_process'=>$scoping_process->id,'activity'=>$activity->id]) }}" method="POST">
    @csrf

    @method('PUT')
    <div class="row">
        <div class="col-xs-6 col-sm-6 col-md-6">
            <div class="form-group">
                <strong>Name:</strong>
                <input type="text" name="name" class="form-control" placeholder="Activity Name" value="{{$activity->name}}" required maxlength="100">
            </div>
        </div>

        <div class="col-xs-1 col-sm-1 col-md-1">
            <div class="form-group">
                <strong>Order:</strong>
                <select name="order" class="form-control" value="{{$activity->order}}">

                    @if ($activity->phase == 'SupportS')

                    @foreach($scoping_process->activities_support as $ac)
                    <option value="{{ $ac->order }}" {{ $activity->order == $ac->order ? 'selected="selected"' : '' }}>
                        {{ $ac->order }}
                    </option>
                    @endforeach
                    @else
                    @if ($activity->phase == 'domain')

                    @foreach($scoping_process->activities_domain as $ac)
                    <option value="{{ $ac->order }}" {{ $activity->order == $ac->order ? 'selected="selected"' : '' }}>
                        {{ $ac->order }}
                    </option>
                    @endforeach
                    @else
                    @if ($activity->phase == 'asset')

                    @foreach($scoping_process->activities_asset as $ac)
                    <option value="{{ $ac->order }}" {{ $activity->order == $ac->order ? 'selected="selected"' : '' }}>
                        {{ $ac->order }}
                    </option>
                    @endforeach
                    @else
                    @if ($activity->phase == 'product')

                    @foreach($scoping_process->activities_product as $ac)
                    <option value="{{ $ac->order }}" {{ $activity->order == $ac->order ? 'selected="selected"' : '' }}>
                        {{ $ac->order }}
                    </option>
                    @endforeach
                    @endif
                    @endif
                    @endif
                    @endif
                </select>
            </div>
        </div>
        <div class="col-xs-3 col-sm-3 col-md-3">
            <div class="form-group">
                <strong>Retrieval Technique:</strong>
                <select name="technique_id" class="form-control" value="{{$activity->technique->name}}">
                    @foreach($project->scoping_techniques($activity->phase)  as $technique)
                    <option value="{{ $technique->id }}" {{ $activity->technique_id == $technique->id ? 'selected="selected"' : '' }}>
                        {{ $technique->name }}
                    </option>
                    @endforeach
                </select>
            </div>
        </div>
        <div class="col-xs-10 col-sm-10 col-md-10">
            <div class="form-group">
                <strong>Description:</strong>
                <textarea class="form-control" id="description" style="height:150px" name="description" placeholder="Description" required maxlength="500">{{$activity->description}}</textarea>
            </div>
        </div>

        <div class="col-xs-12 col-sm-12 col-md-12 text-center">

            <div class="col-xs-12 col-sm-12 col-md-12 text-center">
                <button type="submit" class="btn btn-primary">Update <i class="fas fa-save"></i></button>
            </div>
        </div>

    </div>
    <input type="hidden" id="scoping_process_id" name="scoping_process_id" value=" {{ $scoping_process->id }}">
</form>

@endsection